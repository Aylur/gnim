import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import GioUnix from "gi://GioUnix?version=2.0"
import { CHUNK_SIZE, closeStream, encoder, isCancelled, readBytes, writeAll } from "./lib.js"

interface ToGStreamOptions {
    cancellable?: Gio.Cancellable | null
    onError?(error: unknown): void
}

interface FromGStreamOptions {
    cancellable?: Gio.Cancellable | null
    chunkSize?: number
}

function unixSocket(): Gio.Socket {
    return Gio.Socket.new(Gio.SocketFamily.UNIX, Gio.SocketType.STREAM, Gio.SocketProtocol.DEFAULT)
}

/** Connects two unix sockets to each other, as a pipe that does not raise `SIGPIPE`. */
function socketPair(): [reader: Gio.Socket, writer: Gio.Socket] {
    const name = `gnim-${GLib.uuid_string_random()}`
    const abstract = Gio.UnixSocketAddress.abstract_names_supported()
    const path = abstract ? name : GLib.build_filenamev([GLib.get_user_runtime_dir(), name])
    const address = new Gio.UnixSocketAddress({
        path,
        addressType: abstract ? Gio.UnixSocketAddressType.ABSTRACT : Gio.UnixSocketAddressType.PATH,
    })

    const listener = unixSocket()
    try {
        listener.bind(address, false)
        listener.listen()

        const writer = unixSocket()
        writer.connect(address, null)

        // any process can connect to an abstract address, so other peers are rejected
        const pid = new Gio.Credentials().get_unix_pid()
        for (;;) {
            const reader = listener.accept(null)
            if (!abstract || reader.get_credentials().get_unix_pid() === pid) {
                return [reader, writer]
            }
            reader.close()
        }
    } finally {
        listener.close()
        if (!abstract) GLib.unlink(path)
    }
}

function readerStream(reader: Gio.Socket): GioUnix.InputStream {
    const fds = new Gio.UnixFDList()
    fds.append(reader.get_fd())
    const [fd] = fds.steal_fds()
    reader.close()
    return new GioUnix.InputStream({ fd, closeFd: true })
}

function isStopError(error: unknown): boolean {
    return (
        error instanceof GLib.Error &&
        (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.BROKEN_PIPE) ||
            error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CLOSED) ||
            error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
    )
}

function encode(chunk: unknown): Uint8Array {
    if (typeof chunk === "string") return encoder.encode(chunk)
    if (chunk instanceof Uint8Array) return chunk
    throw new TypeError("toGStream: chunk must be a string or Uint8Array")
}

function toGStream(
    chunks: AsyncIterable<Uint8Array | string>,
    options: ToGStreamOptions = {},
): Gio.InputStream {
    const { cancellable = null, onError = (error: unknown) => logError(error as Error) } = options
    const [reader, writer] = socketPair()

    // a byte that the writer leaves unread when it fails, because closing a unix socket with
    // unread data makes reads of its peer fail with ECONNRESET instead of ending
    reader.send(new Uint8Array([0]), null)

    const input = readerStream(reader)
    const connection = writer.connection_factory_create_connection()

    void (async () => {
        const output = connection.get_output_stream()
        const id = cancellable?.connect(() => writer.close()) ?? 0
        let failed = true

        try {
            for await (const chunk of chunks) {
                try {
                    await writeAll(output, encode(chunk), cancellable)
                } catch (error) {
                    if (isStopError(error)) return
                    throw error
                }
            }
            // closed by cancellable after the last write
            if (writer.is_closed()) return
            writer.receive_bytes(1, -1, null)
            failed = false
        } catch (error) {
            if (!isCancelled(error)) onError(error)
        } finally {
            if (id) cancellable?.disconnect(id)
            if (failed) writer.close()
            else connection.close(null)
        }
    })()

    return input
}

async function* fromGStream(
    input: Gio.InputStream,
    options: FromGStreamOptions = {},
): AsyncGenerator<Uint8Array> {
    const { cancellable = null, chunkSize = CHUNK_SIZE } = options
    try {
        for (;;) {
            const bytes = await readBytes(input, chunkSize, cancellable)
            if (bytes.get_size() === 0) return
            yield bytes.toArray()
        }
    } finally {
        await closeStream(input).catch(() => false)
    }
}

export { toGStream, fromGStream, type ToGStreamOptions, type FromGStreamOptions }
