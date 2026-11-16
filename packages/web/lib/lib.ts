import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"

const CHUNK_SIZE = 64 * 1024
const encoder = /* @__PURE__ */ new TextEncoder()
const decoder = /* @__PURE__ */ new TextDecoder()

function concat(chunks: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
    let offset = 0
    for (const chunk of chunks) {
        out.set(chunk, offset)
        offset += chunk.byteLength
    }
    return out
}

async function collect(chunks: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
    const parts: Uint8Array[] = []
    for await (const chunk of chunks) parts.push(chunk)
    return parts.length === 1 ? parts[0]! : concat(parts)
}

/**
 * Splits `source` so that it can be read twice. Chunks are kept in memory until both branches
 * read them, and `source` is stopped once both branches stopped.
 */
function tee<T>(source: AsyncIterable<T>): [AsyncGenerator<T>, AsyncGenerator<T>] {
    const iterator = source[Symbol.asyncIterator]()
    const queues: T[][] = [[], []]
    const active = [true, true]
    let pulling: Promise<void> | null = null
    let done = false
    let failure: { error: unknown } | null = null

    function pull(): Promise<void> {
        pulling ??= iterator.next().then(
            (result) => {
                pulling = null
                if (result.done) done = true
                else queues.forEach((queue, i) => active[i] && queue.push(result.value))
            },
            (error: unknown) => {
                pulling = null
                failure = { error }
            },
        )
        return pulling
    }

    async function* branch(i: number): AsyncGenerator<T> {
        const queue = queues[i]!
        try {
            for (;;) {
                if (queue.length > 0) yield queue.shift()!
                else if (failure) throw failure.error
                else if (done) return
                else await pull()
            }
        } finally {
            active[i] = false
            queue.length = 0
            if (!active.some(Boolean) && !done && !failure) await iterator.return?.()
        }
    }

    return [branch(0), branch(1)]
}

function guessMimeType(name: string | null): string | null {
    const [type] = Gio.content_type_guess(name, null)
    const mime = Gio.content_type_get_mime_type(type)
    return mime === "application/octet-stream" ? null : mime
}

function fileSize(file: Gio.File): number {
    return file.query_info("standard::size", Gio.FileQueryInfoFlags.NONE, null).get_size()
}

function isCancelled(error: unknown): boolean {
    return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)
}

function openFile(file: Gio.File): Promise<Gio.FileInputStream> {
    return new Promise((resolve, reject) => {
        file.read_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            try {
                resolve(file.read_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })
}

function readBytes(
    input: Gio.InputStream,
    count: number,
    cancellable: Gio.Cancellable | null,
): Promise<GLib.Bytes> {
    return new Promise((resolve, reject) => {
        input.read_bytes_async(count, GLib.PRIORITY_DEFAULT, cancellable, (_, res) => {
            try {
                resolve(input.read_bytes_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })
}

function closeStream(input: Gio.InputStream): Promise<boolean> {
    return new Promise((resolve, reject) => {
        input.close_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            try {
                resolve(input.close_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })
}

function writeBytes(
    output: Gio.OutputStream,
    bytes: GLib.Bytes,
    cancellable: Gio.Cancellable | null,
): Promise<number> {
    return new Promise((resolve, reject) => {
        output.write_bytes_async(bytes, GLib.PRIORITY_DEFAULT, cancellable, (_, res) => {
            try {
                resolve(output.write_bytes_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })
}

// write_all_async does not keep the buffer of a Uint8Array alive, so it is written as GLib.Bytes
async function writeAll(
    output: Gio.OutputStream,
    data: Uint8Array,
    cancellable: Gio.Cancellable | null,
) {
    // GLib.Bytes.new_from_bytes is an instance method before GJS 1.85, so the rest is copied
    while (data.byteLength > 0) {
        const written = await writeBytes(output, new GLib.Bytes(data), cancellable)
        data = data.subarray(written)
    }
}

export {
    CHUNK_SIZE,
    encoder,
    decoder,
    concat,
    collect,
    tee,
    guessMimeType,
    fileSize,
    isCancelled,
    openFile,
    readBytes,
    closeStream,
    writeBytes,
    writeAll,
}

/** `Error.isError` needs GJS 1.85, and a `GLib.Error` is not an `instanceof Error`. */
export function isError(value: unknown): value is Error | GLib.Error {
    return value instanceof Error || value instanceof GLib.Error
}
