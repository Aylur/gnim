import { describe, expect, it } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { fromGStream, toGStream } from "../lib/stream.js"
import { decoder } from "../lib/lib.js"

async function collect(input: Gio.InputStream, cancellable?: Gio.Cancellable): Promise<Uint8Array> {
    const parts: Uint8Array[] = []
    for await (const chunk of fromGStream(input, { cancellable })) parts.push(chunk)
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.byteLength
    }
    return out
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((res) => (resolve = res))
    return { promise, resolve }
}

function isCancelled(error: unknown): boolean {
    return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)
}

describe("toGStream", () => {
    it("streams strings and Uint8Arrays", async () => {
        async function* chunks() {
            yield "hello "
            yield new TextEncoder().encode("world")
        }
        expect(decoder.decode(await collect(toGStream(chunks())))).toBe("hello world")
    })

    it("ends right away for an empty iterable", async () => {
        async function* chunks(): AsyncGenerator<string> {}
        expect(await collect(toGStream(chunks()))).toHaveLength(0)
    })

    it("streams more than fits into the socket", async () => {
        const size = 8 * 1024 * 1024
        async function* chunks() {
            for (let i = 0; i < size / 65536; i++) yield new Uint8Array(65536).fill(i % 256)
        }
        const bytes = await collect(toGStream(chunks()))
        expect(bytes.byteLength).toBe(size)
        expect(bytes[size - 1]).toBe((size / 65536 - 1) % 256)
    })

    it("fails reads and reports the error when producing fails", async () => {
        const reported = deferred<unknown>()
        async function* chunks() {
            yield "partial"
            throw new Error("boom")
        }
        const input = toGStream(chunks(), { onError: reported.resolve })
        await expect(collect(input)).rejects.toBeInstanceOf(GLib.Error)
        await expect(reported.promise).resolves.toEqual(new Error("boom"))
    })

    it("reports chunks that are not strings or Uint8Arrays", async () => {
        const reported = deferred<unknown>()
        async function* chunks() {
            yield 1 as unknown as string
        }
        const input = toGStream(chunks(), { onError: reported.resolve })
        await expect(collect(input)).rejects.toBeInstanceOf(GLib.Error)
        expect(await reported.promise).toBeInstanceOf(TypeError)
    })

    it("fails reads without reporting when the producer is cancelled", async () => {
        let reported = false
        async function* chunks() {
            yield "partial"
            throw new Gio.IOErrorEnum({ code: Gio.IOErrorEnum.CANCELLED, message: "" })
        }
        const input = toGStream(chunks(), { onError: () => (reported = true) })
        await expect(collect(input)).rejects.toBeInstanceOf(GLib.Error)
        expect(reported).toBe(false)
    })

    it("stops the producer when the stream is closed", async () => {
        const stopped = deferred<void>()
        let reported = false
        async function* chunks() {
            try {
                for (;;) yield new Uint8Array(65536)
            } finally {
                stopped.resolve()
            }
        }
        const input = toGStream(chunks(), { onError: () => (reported = true) })
        for await (const chunk of fromGStream(input)) {
            expect(chunk.byteLength).toBeGreaterThan(0)
            break
        }
        await stopped.promise
        expect(reported).toBe(false)
    })

    it("stops the producer and fails reads when cancelled", async () => {
        const cancellable = new Gio.Cancellable()
        const stopped = deferred<void>()
        let reported = false
        async function* chunks() {
            try {
                for (;;) {
                    yield "chunk"
                    await sleep(10)
                }
            } finally {
                stopped.resolve()
            }
        }
        const input = toGStream(chunks(), { cancellable, onError: () => (reported = true) })
        const reading = collect(input)
        await sleep(30)
        cancellable.cancel()

        await expect(reading).rejects.toBeInstanceOf(GLib.Error)
        await stopped.promise
        expect(reported).toBe(false)
    })
})

describe("fromGStream", () => {
    function memory(data: string): Gio.MemoryInputStream {
        return Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new TextEncoder().encode(data)))
    }

    it("reads chunks of at most chunkSize", async () => {
        const chunks: string[] = []
        for await (const chunk of fromGStream(memory("abcdefg"), { chunkSize: 3 })) {
            chunks.push(decoder.decode(chunk))
        }
        expect(chunks).toEqual(["abc", "def", "g"])
    })

    it("closes the stream when it ends", async () => {
        const input = memory("abc")
        await collect(input)
        expect(input.is_closed()).toBe(true)
    })

    it("closes the stream when the loop stops early", async () => {
        const input = memory("abcdef")
        for await (const chunk of fromGStream(input, { chunkSize: 1 })) {
            expect(decoder.decode(chunk)).toBe("a")
            break
        }
        expect(input.is_closed()).toBe(true)
    })

    it("rejects when cancelled", async () => {
        const cancellable = new Gio.Cancellable()
        cancellable.cancel()
        const input = memory("abc")
        const error = await collect(input, cancellable).catch((e: unknown) => e)
        expect(isCancelled(error)).toBe(true)
        expect(input.is_closed()).toBe(true)
    })
})
