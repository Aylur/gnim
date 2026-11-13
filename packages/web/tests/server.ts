import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import { encoder } from "../lib/lib"

type Handler = (message: Soup.ServerMessage, query: Record<string, string>) => void

function respond(message: Soup.ServerMessage, status: number, type: string, body: string) {
    message.set_status(status, null)
    message.set_response(type, Soup.MemoryUse.COPY, encoder.encode(body))
}

let cachedCount = 0

/** `size` bytes of a pattern that does not repeat at chunk boundaries. */
export function pattern(size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    for (let i = 0; i < size; i++) bytes[i] = (i * 7 + (i >> 13)) & 0xff
    return bytes
}

function gzip(data: Uint8Array): Uint8Array {
    const output = Gio.MemoryOutputStream.new_resizable()
    const converter = new Gio.ZlibCompressor({ format: Gio.ZlibCompressorFormat.GZIP })
    const stream = new Gio.ConverterOutputStream({ baseStream: output, converter })
    stream.write_all(data, null)
    stream.close(null)
    return output.steal_as_bytes().toArray()
}

/** The port of the client, `-1` for clients of a unix socket. */
function clientPort(message: Soup.ServerMessage): number {
    const address = message.get_remote_address()
    return address instanceof Gio.InetSocketAddress ? address.get_port() : -1
}

export function sha256(bytes: Uint8Array): string {
    return GLib.compute_checksum_for_data(GLib.ChecksumType.SHA256, bytes)!
}

const routes: Record<string, Handler> = {
    "/gzip"(message, query) {
        message.get_response_headers().append("Content-Encoding", "gzip")
        message.set_status(200, null)
        message.set_response(
            "application/octet-stream",
            Soup.MemoryUse.COPY,
            gzip(pattern(Number(query.size))),
        )
    },
    "/cookies/many"(message) {
        const headers = message.get_response_headers()
        headers.append("Set-Cookie", "a=1; Path=/")
        headers.append("Set-Cookie", "b=2; Path=/")
        respond(message, 200, "text/plain", "cookies")
    },
    "/multipart"(message) {
        const body =
            "--b\r\n" +
            'Content-Disposition: form-data; name="a"\r\n\r\n' +
            "1\r\n" +
            "--b\r\n" +
            'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
            "Content-Type: text/plain\r\n\r\n" +
            "contents\r\n" +
            "--b--\r\n"
        respond(message, 200, "multipart/form-data; boundary=b", body)
    },
    "/urlencoded"(message) {
        respond(message, 200, "application/x-www-form-urlencoded", "a=1&b=x+y")
    },
    "/digest"(message) {
        const headers = message.get_request_headers()
        const data = message.get_request_body().flatten().get_data() ?? new Uint8Array(0)
        const json = JSON.stringify({
            length: data.byteLength,
            sha256: sha256(data),
            contentLength: headers.get_one("content-length"),
            chunked: headers.get_one("transfer-encoding") === "chunked",
        })
        respond(message, 200, "application/json", json)
    },
    "/large"(message, query) {
        message.set_status(200, null)
        message.set_response(
            "application/octet-stream",
            Soup.MemoryUse.COPY,
            pattern(Number(query.size)),
        )
    },
    "/truncate"(message) {
        // sends the start of a chunked body, then closes the connection without ending it
        message.get_response_headers().set_encoding(Soup.Encoding.CHUNKED)
        message.set_status(200, null)
        message.get_response_body().append_bytes(new GLib.Bytes(encoder.encode("partial")))
        const id = message.connect("wrote-chunk", () => {
            message.disconnect(id)
            message.get_socket()?.close()
        })
    },
    "/cached"(message) {
        message.get_response_headers().append("Cache-Control", "max-age=60")
        respond(message, 200, "text/plain", String(++cachedCount))
    },
    "/drop"(message) {
        const data = message.get_request_body().flatten().get_data() ?? new Uint8Array(0)
        respond(message, 200, "text/plain", new TextDecoder().decode(data))
    },
    "/echo"(message) {
        const headers: Record<string, string> = {}
        message.get_request_headers().foreach((name, value) => {
            const key = name.toLowerCase()
            headers[key] = key in headers ? `${headers[key]}, ${value}` : value
        })
        const data = message.get_request_body().flatten().get_data() ?? new Uint8Array(0)
        const body = new TextDecoder().decode(data)
        const json = JSON.stringify({ method: message.get_method(), headers, body })
        respond(message, 200, "application/json", json)
    },
    "/text"(message) {
        respond(message, 200, "text/plain", "hello")
    },
    "/redirect"(message) {
        message.set_redirect(302, "/text")
    },
    "/redirect-to"(message, query) {
        message.set_redirect(Number(query.code), query.to!)
    },
    "/status"(message, query) {
        const status = Number(query.code)
        message.set_status(status, null)
        if (status !== 204 && status !== 304) {
            message.set_response("text/plain", Soup.MemoryUse.COPY, encoder.encode("status"))
        }
    },
    "/stream"(message) {
        message.get_response_headers().set_encoding(Soup.Encoding.CHUNKED)
        message.set_status(200, null)
        const body = message.get_response_body()
        const chunks = ["one ", "two ", "three"]
        message.pause()
        const id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 20, () => {
            const chunk = chunks.shift()
            if (chunk) body.append_bytes(new GLib.Bytes(encoder.encode(chunk)))
            else body.complete()
            message.unpause()
            if (chunk) message.pause()
            return chunk ? GLib.SOURCE_CONTINUE : GLib.SOURCE_REMOVE
        })
        message.connect("finished", () => chunks.length && GLib.source_remove(id))
    },
    "/slow"(message) {
        message.pause()
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
            respond(message, 200, "text/plain", "slow")
            message.unpause()
            return GLib.SOURCE_REMOVE
        })
    },
    "/cookie/set"(message) {
        message.get_response_headers().append("Set-Cookie", "a=1; Path=/")
        respond(message, 200, "text/plain", "set")
    },
    "/cookie/get"(message) {
        respond(message, 200, "text/plain", message.get_request_headers().get_one("cookie") ?? "")
    },
}

/** A server on a free port that answers the routes used by the tests. */
interface ServerOptions {
    /** Serves HTTPS with this certificate. */
    tls?: Gio.TlsCertificate
    /** Listens on a unix socket at this path instead of a port. */
    unix?: string
}

export function startServer({ tls, unix }: ServerOptions = {}): {
    url: (path: string) => string
    /** How many requests to `/drop` were dropped, because they reused a connection. */
    dropped(): number
    stop(): void
} {
    const server = new Soup.Server({ tlsCertificate: tls ?? null })
    const ports = new Set<number>()
    let dropped = 0

    // closes the connection of requests to /drop that are sent on a reused connection, like a
    // server closing an idle keep-alive connection while the client reuses it
    server.add_early_handler(null, (_, message, path) => {
        const port = clientPort(message)
        if (path === "/drop" && port !== -1 && ports.has(port)) {
            dropped++
            message.steal_connection().close(null)
        }
    })

    server.add_handler(null, (_, message, path, query) => {
        ports.add(clientPort(message))
        const route = routes[path]
        if (route) route(message, query ?? {})
        else respond(message, 404, "text/plain", "not found")
    })
    if (unix) {
        server.listen(Gio.UnixSocketAddress.new(unix), 0)
    } else {
        const https = tls ? Soup.ServerListenOptions.HTTPS : 0
        server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY | https)
    }

    // Soup.Server.get_uris does not support unix sockets
    const base = unix ? "http://localhost" : server.get_uris()[0]!.to_string().replace(/\/$/, "")
    return {
        url: (path) => `${base}${path}`,
        dropped: () => dropped,
        stop() {
            server.disconnect()
            if (unix) GLib.unlink(unix)
        },
    }
}
