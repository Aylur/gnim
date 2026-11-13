import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import {
    CHUNK_SIZE,
    collect,
    concat,
    decoder,
    encoder,
    fileSize,
    guessMimeType,
    openFile,
} from "./lib.js"
import { fromGStream, toGStream } from "./stream.js"

type BlobPart = Blob | string | ArrayBuffer | ArrayBufferView | GLib.Bytes | Gio.File

interface BlobPropertyBag {
    type?: string
    endings?: "transparent" | "native"
}

interface FilePropertyBag extends BlobPropertyBag {
    lastModified?: number
}

interface FilePart {
    file: Gio.File
    start: number
    end: number
}

type Part = Uint8Array | FilePart

function normalizeType(type: string): string {
    // the spec requires types with non printable ASCII characters to be ignored
    return /^[\x20-\x7e]*$/.test(type) ? type.toLowerCase() : ""
}

function clamp(index: number, size: number): number {
    const i = Math.trunc(index) || 0
    return i < 0 ? Math.max(size + i, 0) : Math.min(i, size)
}

function partSize(part: Part): number {
    return part instanceof Uint8Array ? part.byteLength : part.end - part.start
}

function sliceParts(parts: Part[], from: number, to: number): Part[] {
    const sliced: Part[] = []
    let offset = 0

    for (const part of parts) {
        const size = partSize(part)
        const start = Math.max(from - offset, 0)
        const end = Math.min(to - offset, size)

        if (start < end) {
            sliced.push(
                part instanceof Uint8Array
                    ? part.subarray(start, end)
                    : { file: part.file, start: part.start + start, end: part.start + end },
            )
        }
        offset += size
    }

    return sliced
}

async function* readFilePart({ file, start, end }: FilePart): AsyncGenerator<Uint8Array> {
    const input = await openFile(file)
    if (start > 0) input.seek(start, GLib.SeekType.SET, null)

    let remaining = end - start
    for await (const chunk of fromGStream(input, { chunkSize: Math.min(remaining, CHUNK_SIZE) })) {
        const part = chunk.byteLength > remaining ? chunk.subarray(0, remaining) : chunk
        remaining -= part.byteLength
        yield part
        if (remaining === 0) return
    }
    if (remaining > 0) throw new Error(`Blob: ${file.get_parse_name()} changed after it was read`)
}

async function* partChunks(parts: Part[]): AsyncGenerator<Uint8Array> {
    for (const part of parts) {
        if (part instanceof Uint8Array) {
            if (part.byteLength > 0) yield part.slice()
        } else if (part.end > part.start) {
            yield* readFilePart(part)
        }
    }
}

let chunksOf: (blob: Blob) => AsyncGenerator<Uint8Array>

/**
 * Implementation of the [Blob](https://developer.mozilla.org/docs/Web/API/Blob) web API.
 */
class Blob {
    #parts: Part[]
    #size: number
    readonly #type: string

    static {
        chunksOf = (blob) => partChunks(blob.#parts)
    }

    constructor(parts: Iterable<BlobPart> = [], options: BlobPropertyBag = {}) {
        const { type = "", endings = "transparent" } = options
        if (endings !== "transparent" && endings !== "native") {
            throw new TypeError(`Blob: invalid endings "${endings}"`)
        }

        // parts are copied so that later mutations do not change the blob
        this.#parts = [...parts].flatMap((part): Part[] => {
            if (part instanceof Blob) return part.#parts
            if (part instanceof GLib.Bytes) return [part.toArray()]
            if (part instanceof Gio.File) return [{ file: part, start: 0, end: fileSize(part) }]
            if (part instanceof ArrayBuffer) return [new Uint8Array(part.slice(0))]
            if (ArrayBuffer.isView(part)) {
                return [new Uint8Array(part.buffer, part.byteOffset, part.byteLength).slice()]
            }
            const str = String(part)
            return [encoder.encode(endings === "native" ? str.replace(/\r\n?/g, "\n") : str)]
        })

        this.#size = this.#parts.reduce((sum, part) => sum + partSize(part), 0)
        this.#type = normalizeType(type)
    }

    /** The size in bytes. */
    get size(): number {
        return this.#size
    }

    /** The lowercase MIME type, `""` when it is not known. */
    get type(): string {
        return this.#type
    }

    /** Returns the bytes between `start` and `end` as a new blob, negative indices count from the end. */
    slice(start = 0, end = this.size, contentType = ""): Blob {
        const blob = new Blob([], { type: contentType })
        blob.#parts = sliceParts(this.#parts, clamp(start, this.size), clamp(end, this.size))
        blob.#size = blob.#parts.reduce((sum, part) => sum + partSize(part), 0)
        return blob
    }

    /** The contents as a `Gio.InputStream`. */
    gstream(): Gio.InputStream {
        const parts = this.#parts
        const [first] = parts

        if (parts.every((part) => part instanceof Uint8Array)) {
            return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(concat(parts)))
        }
        if (parts.length === 1 && first && !(first instanceof Uint8Array)) {
            if (first.start === 0 && first.end === fileSize(first.file)) {
                return first.file.read(null)
            }
        }
        return toGStream(partChunks(parts))
    }

    /** Contents as an array of bytes. */
    async bytes(): Promise<Uint8Array> {
        return collect(partChunks(this.#parts))
    }

    /** Contents as an `ArrayBuffer`. */
    async arrayBuffer(): Promise<ArrayBuffer> {
        const bytes = await this.bytes()
        // a chunk read from a file can be a view into a larger buffer
        return bytes.byteLength === bytes.buffer.byteLength
            ? (bytes.buffer as ArrayBuffer)
            : (bytes.slice().buffer as ArrayBuffer)
    }

    /** Contents as decoded UTF-8 string. */
    async text(): Promise<string> {
        return decoder.decode(await this.bytes())
    }

    get [Symbol.toStringTag](): string {
        return "Blob"
    }
}

function gioFileInit(file: Gio.File, name?: string): { name: string; options: FilePropertyBag } {
    const info = file.query_info("time::modified", Gio.FileQueryInfoFlags.NONE, null)
    const modified = info.get_modification_date_time()
    return {
        name: name ?? file.get_basename() ?? "",
        options: {
            type: guessMimeType(file.get_basename()) ?? "",
            ...(modified && {
                lastModified:
                    modified.to_unix() * 1000 + Math.trunc(modified.get_microsecond() / 1000),
            }),
        },
    }
}

/**
 * Implementation of the [File](https://developer.mozilla.org/docs/Web/API/File) web API.
 */
class File extends Blob {
    /** The name of the file. */
    readonly name: string
    /**
     * The modification time in milliseconds since the Unix epoch.
     */
    readonly lastModified: number

    constructor(parts: Iterable<BlobPart>, name: string, options?: FilePropertyBag)
    constructor(file: Gio.File, name?: string)
    constructor(
        source: Iterable<BlobPart> | Gio.File,
        name?: string,
        options: FilePropertyBag = {},
    ) {
        const init = source instanceof Gio.File ? gioFileInit(source, name) : { name, options }
        super(source instanceof Gio.File ? [source] : source, init.options)
        this.name = String(init.name)
        this.lastModified = init.options.lastModified ?? Date.now()
    }

    get [Symbol.toStringTag](): string {
        return "File"
    }
}

export {
    Blob,
    File,
    type BlobPart,
    type BlobPropertyBag,
    type FilePropertyBag,
    chunksOf as blobChunks,
}
