import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { Blob, File, blobChunks } from "./blob.js"
import { FormData, decodeFormData, encodeFormData } from "./formdata.js"
import type { Headers } from "./headers.js"
import { CHUNK_SIZE, collect, decoder, encoder, tee } from "./lib.js"
import { fromGStream, toGStream } from "./stream.js"
import { URLSearchParams } from "./url.js"

type BodyInit =
    | string
    | ArrayBuffer
    | ArrayBufferView
    | URLSearchParams
    | Blob
    | FormData
    | GLib.Bytes
    | Gio.InputStream
    | Gio.File
    | AsyncIterable<Uint8Array | string>

type BodySource =
    | { kind: "bytes"; bytes: Uint8Array }
    | { kind: "blob"; blob: Blob }
    | { kind: "stream"; stream: Gio.InputStream; cancellable: Gio.Cancellable | null }
    | {
          kind: "chunks"
          chunks(): AsyncIterable<Uint8Array>
          length: number | null
          replayable: boolean
      }

async function* encodeChunks(
    chunks: AsyncIterable<Uint8Array | string>,
): AsyncGenerator<Uint8Array> {
    for await (const chunk of chunks) {
        if (typeof chunk === "string") yield encoder.encode(chunk)
        else if (chunk instanceof Uint8Array) yield chunk
        else throw new TypeError("Body: chunks must be strings or Uint8Arrays")
    }
}

function sourceChunks(
    source: Extract<BodySource, { kind: "stream" | "chunks" }>,
): AsyncIterable<Uint8Array> {
    return source.kind === "stream"
        ? fromGStream(source.stream, { cancellable: source.cancellable })
        : source.chunks()
}

function isReplayable(source: BodySource): boolean {
    return source.kind === "chunks" ? source.replayable : source.kind !== "stream"
}

async function* bodyChunks(
    source: BodySource | null,
    chunkSize: number,
): AsyncGenerator<Uint8Array> {
    switch (source?.kind) {
        case "bytes":
            if (source.bytes.byteLength > 0) yield source.bytes
            break
        case "blob":
            yield* blobChunks(source.blob)
            break
        case "stream":
            yield* fromGStream(source.stream, { cancellable: source.cancellable, chunkSize })
            break
        case "chunks":
            yield* source.chunks()
            break
    }
}

async function readSource(source: BodySource | null): Promise<Uint8Array> {
    switch (source?.kind) {
        case "bytes":
            return source.bytes
        case "blob":
            return source.blob.bytes()
        case "stream":
        case "chunks":
            return collect(sourceChunks(source))
        default:
            return new Uint8Array(0)
    }
}

function sourceStream(source: BodySource): Gio.InputStream {
    switch (source.kind) {
        case "bytes":
            return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(source.bytes))
        case "blob":
            return source.blob.stream()
        case "stream":
            return source.stream
        case "chunks":
            return toGStream(source.chunks())
    }
}

function extract(body: BodyInit): { source: BodySource; contentType: string | null } {
    if (typeof body === "string") {
        return {
            source: { kind: "bytes", bytes: encoder.encode(body) },
            contentType: "text/plain;charset=UTF-8",
        }
    }
    if (body instanceof URLSearchParams) {
        return {
            source: { kind: "bytes", bytes: encoder.encode(body.toString()) },
            contentType: "application/x-www-form-urlencoded;charset=UTF-8",
        }
    }
    if (body instanceof Blob) {
        return { source: { kind: "blob", blob: body }, contentType: body.type || null }
    }
    if (body instanceof Gio.File) {
        const file = new File(body)
        return { source: { kind: "blob", blob: file }, contentType: file.type || null }
    }
    if (body instanceof FormData) {
        const { chunks, contentType, length } = encodeFormData(body)
        return { source: { kind: "chunks", chunks, length, replayable: true }, contentType }
    }
    if (body instanceof Gio.InputStream) {
        return { source: { kind: "stream", stream: body, cancellable: null }, contentType: null }
    }
    if (body instanceof GLib.Bytes) {
        return { source: { kind: "bytes", bytes: body.toArray() }, contentType: null }
    }
    // the spec requires a copy so that later mutations do not change the body
    if (body instanceof ArrayBuffer) {
        return {
            source: { kind: "bytes", bytes: new Uint8Array(body.slice(0)) },
            contentType: null,
        }
    }
    if (ArrayBuffer.isView(body)) {
        const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength)
        return { source: { kind: "bytes", bytes: view.slice() }, contentType: null }
    }
    if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
        return {
            source: {
                kind: "chunks",
                chunks: () => encodeChunks(body),
                length: null,
                replayable: false,
            },
            contentType: null,
        }
    }
    throw new TypeError("Body: unsupported body type")
}

let take: (body: Body) => BodySource | null
let init: (body: Body, source: BodySource | null) => void

/**
 * Shared implementation of the body mixin used by `Request` and `Response`.
 */
abstract class Body {
    #source: BodySource | null = null
    #used = false
    #stream: Gio.InputStream | null = null

    /** The headers. */
    readonly headers: Headers

    static {
        take = (body) => body.#take()
        init = (body, source) => void (body.#source = source)
    }

    /**
     * @param body the body to extract, or another body whose source is transferred
     * @param headers receives a default `content-type` when it does not have one
     */
    protected constructor(body: BodyInit | Body | null, headers: Headers) {
        this.headers = headers

        if (body instanceof Body) {
            this.#source = body.#take()
        } else if (body !== null) {
            const { source, contentType } = extract(body)
            this.#source = source
            if (contentType && !headers.has("content-type")) {
                headers.set("content-type", contentType)
            }
        }
    }

    #take(): BodySource | null {
        if (this.#used) throw new TypeError("Body: body has already been consumed")
        if (this.#source) this.#used = true
        return this.#source
    }

    protected get hasBody(): boolean {
        return this.#source !== null
    }

    /** `ReadableStream` is not yet implemented. Use {@link stream} or {@link chunks}. */
    get body(): never {
        throw new Error("Body.body: ReadableStream is not implemented, use stream instead")
    }

    /** The body as a `Gio.InputStream`, `null` when there is no body. */
    get stream(): Gio.InputStream | null {
        if (this.#stream) return this.#stream
        const source = this.#take()
        if (source) this.#stream = sourceStream(source)
        return this.#stream
    }

    /** Reads the body in chunks while it arrives, instead of buffering. */
    chunks(chunkSize = CHUNK_SIZE): AsyncGenerator<Uint8Array> {
        if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
            throw new RangeError(`Body.chunks: chunk size must be a positive integer`)
        }
        return bodyChunks(this.#take(), chunkSize)
    }

    /** Whether the body has been read. */
    get bodyUsed(): boolean {
        return this.#used
    }

    #consume(): Promise<Uint8Array> {
        return readSource(this.#take())
    }

    /** Splits the body so that it can be read by both this object and its clone. */
    protected cloneSource(): BodySource | null {
        if (this.#used) throw new TypeError("Body: cannot clone a body that has been read")

        const source = this.#source
        switch (source?.kind) {
            case "bytes":
                return { kind: "bytes", bytes: source.bytes.slice() }
            case "stream":
            case "chunks": {
                if (isReplayable(source)) return source
                const [a, b] = tee(sourceChunks(source))
                const length = source.kind === "chunks" ? source.length : null
                this.#source = { kind: "chunks", chunks: () => a, length, replayable: false }
                return { kind: "chunks", chunks: () => b, length, replayable: false }
            }
            default:
                return source
        }
    }

    /** Reads the whole body. */
    async bytes(): Promise<Uint8Array> {
        return this.#consume()
    }

    /** Reads the whole body as an `ArrayBuffer`. */
    async arrayBuffer(): Promise<ArrayBuffer> {
        const bytes = await this.#consume()
        // bytes read from a stream can be a view into a larger buffer
        return bytes.byteLength === bytes.buffer.byteLength
            ? (bytes.buffer as ArrayBuffer)
            : (bytes.slice().buffer as ArrayBuffer)
    }

    /** Reads the whole body decoded as UTF-8. */
    async text(): Promise<string> {
        return decoder.decode(await this.#consume())
    }

    /** Reads the whole body and parses it as JSON. */
    async json<T = unknown>(): Promise<T> {
        return JSON.parse(await this.text())
    }

    /** Reads the body as a `Blob` typed by `content-type`. */
    async blob(): Promise<Blob> {
        const type = this.headers.get("content-type") ?? ""
        const source = this.#take()
        // blobs are not read, so that files stay on disk
        if (source?.kind === "blob") return source.blob.slice(0, source.blob.size, type)
        return new Blob([await readSource(source)], { type })
    }

    /** Parses a `multipart/form-data` or `application/x-www-form-urlencoded` body. */
    async formData(): Promise<FormData> {
        return decodeFormData(await this.#consume(), this.headers.get("content-type"))
    }
}

export {
    Body,
    type BodyInit,
    type BodySource,
    take as takeBody,
    init as initBody,
    bodyChunks,
    sourceStream,
    isReplayable,
}
