import GLib from "gi://GLib?version=2.0"
import GLibUnix from "gi://GLibUnix?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import { type BodySource, bodyChunks, initBody, takeBody } from "./body.js"
import { CHUNK_SIZE, closeStream, decoder, isError } from "./lib.js"
import { Request } from "./request.js"
import { NULL_BODY_STATUS, Response } from "./response.js"
import { URL } from "./url.js"

type ServeAddress =
    | {
          /** Defaults to `0`, which picks a free port. */
          port?: number
          /** `"localhost"` or an IP address, defaults to `"localhost"`. */
          hostname?: string
          unix?: never
      }
    | {
          /** Path of a unix socket to listen on, which is removed when the server stops. */
          unix: string
          port?: never
          hostname?: never
      }

/** A certificate with its private key, as PEM or as files containing PEM. */
type ServeTls = { cert: string | Gio.File; key: string | Gio.File } | Gio.TlsCertificate

/** Properties passed to the `Soup.Server`. */
interface ServerProps {
    /** The `Server` header of responses, Soup appends its own name when it ends with a space. */
    serverHeader?: string
    /** Whether the client has to authenticate with a certificate of `tlsDatabase`. */
    tlsAuthMode?: Gio.TlsAuthenticationMode
    /** Verifies client certificates. */
    tlsDatabase?: Gio.TlsDatabase | null
    /** Keeps percent-encoded characters of the path as they are. */
    rawPaths?: boolean
}

type ServeOptions = ServerProps &
    ServeAddress & {
        /** Serves HTTPS with this certificate. */
        tls?: ServeTls
        /** Answers a request, called as soon as its headers arrived. */
        fetch(request: Request, server: Server): Response | Promise<Response>
        /** Creates the response when `fetch` throws, defaults to a `500` response. */
        error?(error: unknown): Response | Promise<Response>
        /** Stops the server once it is cancelled. */
        cancellable?: Gio.Cancellable | null
    }

interface Server {
    /** `null` when listening on a unix socket. */
    readonly url: URL | null
    /** The underlying server. */
    readonly soup: Soup.Server
    /** The address of the client that sent `request`. */
    remoteAddress(request: Request): Gio.SocketAddress | null
    /** Closes the listeners and all connections. */
    stop(): void
}

type Address = { unix: string } | { port: number; hostname: string }

const running = new Set<Server>()
const HIGH_WATER_MARK = 1024 * 1024
const FRAMING_HEADERS = ["content-length", "transfer-encoding", "connection"]

function isConnectionClosed(error: unknown): boolean {
    return (
        error instanceof GLib.Error &&
        error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CONNECTION_CLOSED)
    )
}

class BodyQueue {
    #message: Soup.ServerMessage
    #chunks: Uint8Array[] = []
    #size = 0
    #ended = false
    #error: GLib.Error | null = null
    #paused = false
    #limited = true
    #wake: (() => void) | null = null

    constructor(message: Soup.ServerMessage) {
        this.#message = message
        message.get_request_body().set_accumulate(false)
        message.connect("got-chunk", (_, chunk) =>
            this.#push(chunk instanceof GLib.Bytes ? chunk.toArray() : chunk),
        )
        message.connect("got-body", () => this.#end(null))
        message.connect("disconnected", () =>
            this.#end(
                new Gio.IOErrorEnum({
                    code: Gio.IOErrorEnum.CONNECTION_CLOSED,
                    message: "The client closed the connection",
                }),
            ),
        )
    }

    #push(chunk: Uint8Array) {
        if (this.#error) return
        this.#chunks.push(chunk)
        this.#size += chunk.byteLength
        if (this.#limited && this.#size > HIGH_WATER_MARK && !this.#paused) {
            this.#paused = true
            this.#message.pause()
        }
        this.#notify()
    }

    #end(error: GLib.Error | null) {
        if (this.#ended) return
        this.#ended = true
        this.#error = error
        this.#notify()
    }

    #notify() {
        this.#wake?.()
        this.#wake = null
    }

    #resume() {
        if (!this.#paused) return
        this.#paused = false
        this.#message.unpause()
    }

    // Soup writes the response only once the request body has been read,
    // so reading it cannot wait for the handler after it responded:
    // the rest is kept in memory when the body is in use, otherwise it is dropped.
    release(used: boolean) {
        this.#limited = false
        if (!used) {
            this.#chunks = []
            this.#error ??= new Gio.IOErrorEnum({
                code: Gio.IOErrorEnum.CLOSED,
                message: "The request body was not read before responding",
            })
        }
        this.#resume()
    }

    async *chunks(): AsyncGenerator<Uint8Array> {
        for (;;) {
            const chunk = this.#chunks.shift()
            if (chunk) {
                this.#size -= chunk.byteLength
                if (this.#size <= HIGH_WATER_MARK) this.#resume()
                yield chunk
            } else if (this.#error) {
                throw this.#error
            } else if (this.#ended) {
                return
            } else {
                await new Promise<void>((resolve) => (this.#wake = resolve))
            }
        }
    }
}

function hasBody(message: Soup.ServerMessage): boolean {
    const method = message.get_method()
    if (method === "GET" || method === "HEAD") return false

    const headers = message.get_request_headers()
    switch (headers.get_encoding()) {
        case Soup.Encoding.CHUNKED:
            return true
        case Soup.Encoding.CONTENT_LENGTH:
            return headers.get_content_length() > 0
        default:
            return false
    }
}

function toRequest(message: Soup.ServerMessage): { request: Request; queue: BodyQueue | null } {
    const cancellable = new Gio.Cancellable()
    const disconnected = message.connect("disconnected", () => cancellable.cancel())
    message.connect("finished", () => message.disconnect(disconnected))

    const request = new Request(message.get_uri().to_string(), {
        method: message.get_method(),
        headers: message.get_request_headers(),
        signal: cancellable,
    })

    if (!hasBody(message)) return { request, queue: null }

    const headers = message.get_request_headers()
    const queue = new BodyQueue(message)
    initBody(request, {
        kind: "chunks",
        chunks: () => queue.chunks(),
        length:
            headers.get_encoding() === Soup.Encoding.CONTENT_LENGTH
                ? headers.get_content_length()
                : null,
        replayable: false,
    })
    return { request, queue }
}

function watchDisconnect(message: Soup.ServerMessage, onClose: () => void): () => void {
    const socket = message.get_socket()
    if (!socket) return () => {}

    let watching = true
    const condition = GLib.IOCondition.IN | GLib.IOCondition.HUP | GLib.IOCondition.ERR
    const id = GLibUnix.fd_add_full(GLib.PRIORITY_DEFAULT, socket.get_fd(), condition, () => {
        watching = false
        // available data is a pipelined request, which is read after this one is answered
        if (socket.get_available_bytes() <= 0) {
            socket.close()
            onClose()
        }
        return GLib.SOURCE_REMOVE
    })

    return () => {
        if (watching) GLib.source_remove(id)
        watching = false
    }
}

function sourceLength(source: BodySource): number | null {
    switch (source.kind) {
        case "bytes":
            return source.bytes.byteLength
        case "blob":
            return source.blob.size
        case "chunks":
            return source.length
        case "stream":
            return null
    }
}

function wroteChunk(message: Soup.ServerMessage): Promise<void> {
    return new Promise((resolve, reject) => {
        const settle = (done: () => void) => {
            for (const id of ids) message.disconnect(id)
            done()
        }
        const ids = [
            message.connect("wrote-chunk", () => settle(resolve)),
            message.connect("disconnected", () =>
                settle(() =>
                    reject(
                        new Gio.IOErrorEnum({
                            code: Gio.IOErrorEnum.CONNECTION_CLOSED,
                            message: "The client closed the connection",
                        }),
                    ),
                ),
            ),
        ]
    })
}

async function writeBody(message: Soup.ServerMessage, source: BodySource) {
    const headers = message.get_response_headers()
    const body = message.get_response_body()

    const length = sourceLength(source)
    if (length === null) headers.set_encoding(Soup.Encoding.CHUNKED)
    else headers.set_content_length(length)

    for await (const chunk of bodyChunks(source, CHUNK_SIZE)) {
        const wrote = wroteChunk(message)
        body.append_bytes(new GLib.Bytes(chunk))
        message.unpause()
        await wrote
    }
}

function dropBody(source: BodySource) {
    if (source.kind === "stream") closeStream(source.stream).catch(logError)
}

async function writeResponse(message: Soup.ServerMessage, response: Response) {
    message.set_status(response.status, response.statusText || null)

    const headers = message.get_response_headers()
    for (const [name, value] of response.headers) {
        if (!FRAMING_HEADERS.includes(name)) headers.append(name, value)
    }

    const source = takeBody(response)
    const skipBody = message.get_method() === "HEAD" || NULL_BODY_STATUS.includes(response.status)

    if (source && skipBody) {
        dropBody(source)
    } else if (source?.kind === "bytes") {
        message.get_response_body().append_bytes(new GLib.Bytes(source.bytes))
    } else if (source) {
        try {
            await writeBody(message, source)
        } catch (error) {
            // the status has been sent already, so the response can only be cut off
            if (!isConnectionClosed(error)) logError(error as Error)
            message.get_socket()?.close()
            return
        }
    }

    message.get_response_body().complete()
    message.unpause()
}

function pem(source: string | Gio.File): string {
    if (typeof source === "string") return source
    const [, contents] = source.load_contents(null)
    return decoder.decode(contents)
}

function tlsCertificate(tls: ServeTls): Gio.TlsCertificate {
    if (!Gio.TlsBackend.get_default().supports_tls()) {
        throw new Error("serve: HTTPS requires a TLS backend for GIO, such as glib-networking")
    }
    if (tls instanceof Gio.TlsCertificate) return tls
    return Gio.TlsCertificate.new_from_pem(`${pem(tls.cert)}\n${pem(tls.key)}`, -1)
}

function defaultError(error: unknown): Response {
    if (isError(error)) {
        logError(error)
    } else {
        console.warn(error)
    }

    return new Response("Internal Server Error", { status: 500 })
}

function listen(soup: Soup.Server, address: Address, flags: Soup.ServerListenOptions) {
    if ("unix" in address) {
        soup.listen(Gio.UnixSocketAddress.new(address.unix), flags)
    } else if (address.hostname === "localhost") {
        soup.listen_local(address.port, flags)
    } else {
        const inet = Gio.InetSocketAddress.new_from_string(address.hostname, address.port)
        if (!inet) {
            throw new TypeError(
                `serve: hostname must be "localhost" or an IP address, not "${address.hostname}"`,
            )
        }
        soup.listen(inet, flags)
    }
}

function serverUrl(soup: Soup.Server, address: Address, secure: boolean): URL | null {
    if ("unix" in address) return null

    const local = soup.get_listeners()[0]?.get_local_address()
    const port = local instanceof Gio.InetSocketAddress ? local.get_port() : address.port
    const host = address.hostname.includes(":") ? `[${address.hostname}]` : address.hostname
    return new URL(`${secure ? "https" : "http"}://${host}:${port}/`)
}

/**
 * @experimental
 *
 * HTTP server built on [Soup.Server](https://libsoup.gnome.org/libsoup-3.0/class.Server.html).
 *
 * @example
 *
 * ```ts
 * const server = serve({
 *     port: 8000,
 *     fetch(request: Request) {
 *         const url = new URL(request.url)
 *         return Response.json({ path: url.pathname })
 *     },
 * })
 *
 * server.stop()
 * ```
 */
function serve(options: ServeOptions): Server {
    const {
        fetch,
        error = defaultError,
        cancellable = null,
        port = 0,
        hostname = "localhost",
        unix,
        tls,
        ...props
    } = options
    const address: Address = typeof unix === "string" ? { unix } : { port, hostname }
    const certificate = tls ? tlsCertificate(tls) : null
    const secure = certificate !== null

    const soup = new Soup.Server({ ...props, tlsCertificate: certificate })
    listen(soup, address, secure ? Soup.ServerListenOptions.HTTPS : 0)

    const messages = new WeakMap<Request, Soup.ServerMessage>()
    const responses = new WeakMap<Soup.ServerMessage, Promise<Response>>()
    const cancellables = new WeakMap<Soup.ServerMessage, Gio.Cancellable>()

    let stopped = false
    const server: Server = {
        url: serverUrl(soup, address, secure),
        soup,
        remoteAddress: (request) => messages.get(request)?.get_remote_address() ?? null,
        stop() {
            if (stopped) return
            stopped = true
            running.delete(server)
            soup.disconnect()
            if ("unix" in address) GLib.unlink(address.unix)
        },
    }

    async function respond(message: Soup.ServerMessage): Promise<Response> {
        let queue: BodyQueue | null = null
        try {
            const created = toRequest(message)
            queue = created.queue
            messages.set(created.request, message)
            cancellables.set(message, created.request.signal!)
            const response = await fetch(created.request, server)
            if (!(response instanceof Response)) {
                throw new TypeError("serve: fetch did not return a Response")
            }
            if (response.type === "error") {
                throw new TypeError("serve: fetch returned a network error")
            }
            queue?.release(created.request.bodyUsed)
            return response
        } catch (cause) {
            queue?.release(false)
            try {
                return await error(cause)
            } catch (failed) {
                return defaultError(failed)
            }
        }
    }

    soup.add_early_handler(null, (_, message) => {
        responses.set(message, respond(message))
    })

    // Soup can only respond once the body has been read
    soup.add_handler(null, (_, message) => {
        message.pause()
        const unwatch = watchDisconnect(message, () => cancellables.get(message)?.cancel())
        const response = responses.get(message) ?? respond(message)
        void response
            .then((res) => {
                unwatch()
                return writeResponse(message, res)
            })
            .catch(logError)
    })

    running.add(server)
    cancellable?.connect(() => server.stop())

    return server
}

export { serve, type ServeOptions, type ServeTls, type Server }
