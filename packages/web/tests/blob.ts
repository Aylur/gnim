import { afterAll, describe, expect, it } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { Blob, File } from "../lib/blob.js"
import { concat } from "../lib/lib.js"
import { fromGStream } from "../lib/stream.js"

const files: Gio.File[] = []

afterAll(() => {
    for (const file of files) file.delete(null)
})

function tempFile(contents: string, name = "gnim-XXXXXX.txt"): Gio.File {
    const [file, stream] = Gio.File.new_tmp(name)
    stream.close(null)
    file.replace_contents(new TextEncoder().encode(contents), null, false, 0, null)
    files.push(file)
    return file
}

async function readStream(input: Gio.InputStream): Promise<string> {
    const chunks: Uint8Array[] = []
    for await (const chunk of fromGStream(input)) chunks.push(chunk)
    return new TextDecoder().decode(concat(chunks))
}

describe("Blob", () => {
    it("concatenates parts", async () => {
        const blob = new Blob([
            "a",
            new Uint8Array([98]),
            new Uint8Array([99]).buffer,
            new GLib.Bytes(new Uint8Array([100])),
            new Blob(["e"]),
        ])
        expect(blob.size).toBe(5)
        expect(await blob.text()).toBe("abcde")
    })

    it("copies parts", async () => {
        const bytes = new Uint8Array([97])
        const blob = new Blob([bytes])
        bytes[0] = 98
        expect(await blob.text()).toBe("a")
    })

    it("normalizes the type", () => {
        expect(new Blob([], { type: "Text/Plain" }).type).toBe("text/plain")
        expect(new Blob([], { type: "aé" }).type).toBe("")
    })

    it("converts native endings", async () => {
        const blob = new Blob(["a\r\nb\rc"], { endings: "native" })
        expect(await blob.text()).toBe("a\nb\nc")
        expect(() => new Blob([], { endings: "x" as "native" })).toThrow(TypeError)
    })

    it("slices with negative indices", async () => {
        const blob = new Blob(["hello", " ", "world"])
        expect(await blob.slice(2, 7).text()).toBe("llo w")
        expect(await blob.slice(-5).text()).toBe("world")
        expect(await blob.slice(-5, -3).text()).toBe("wo")
        expect(blob.slice(3, 1).size).toBe(0)
        expect(blob.slice(0, 1, "Text/Plain").type).toBe("text/plain")
    })

    it("reads bytes and array buffers", async () => {
        const blob = new Blob(["ab"])
        expect(await blob.bytes()).toEqual(new Uint8Array([97, 98]))
        const buffer = await blob.arrayBuffer()
        expect(buffer.byteLength).toBe(2)
    })

    it("reads Gio.File parts lazily", async () => {
        const file = tempFile("hello world")
        const blob = new Blob(["<", file, ">"])
        expect(blob.size).toBe(13)
        file.replace_contents(new TextEncoder().encode("HELLO WORLD"), null, false, 0, null)
        expect(await blob.text()).toBe("<HELLO WORLD>")
        expect(await blob.slice(3, 8).text()).toBe("LLO W")
    })

    it("fails when a file got shorter", async () => {
        const file = tempFile("hello world")
        const blob = new Blob([file])
        file.replace_contents(new TextEncoder().encode("hi"), null, false, 0, null)
        await expect(blob.text()).rejects.toThrow("changed")
    })

    it("streams in memory blobs", async () => {
        const stream = new Blob(["a", "b"]).gstream()
        expect(stream).toBeInstanceOf(Gio.MemoryInputStream)
        expect(await readStream(stream)).toBe("ab")
    })

    it("streams whole files from the file", async () => {
        const stream = new Blob([tempFile("contents")]).gstream()
        expect(stream).toBeInstanceOf(Gio.FileInputStream)
        expect(await readStream(stream)).toBe("contents")
    })

    it("streams files mixed with other parts", async () => {
        const blob = new Blob(["<", tempFile("hello world"), ">"]).slice(0, 7)
        expect(await readStream(blob.gstream())).toBe("<hello ")
    })

    it("streams large files", async () => {
        const contents = "x".repeat(200 * 1024)
        const blob = new Blob(["<", tempFile(contents), ">"])
        expect(await readStream(blob.gstream())).toBe(`<${contents}>`)
    })

    it("has a string tag", () => {
        expect(Object.prototype.toString.call(new Blob())).toBe("[object Blob]")
    })
})

describe("File", () => {
    it("has a name and lastModified", () => {
        const file = new File(["a"], "a.txt", { type: "text/plain", lastModified: 42 })
        expect(file.name).toBe("a.txt")
        expect(file.lastModified).toBe(42)
        expect(file.type).toBe("text/plain")
        expect(file).toBeInstanceOf(Blob)
        expect(Object.prototype.toString.call(file)).toBe("[object File]")
    })

    it("defaults lastModified to now", () => {
        const before = Date.now()
        const file = new File([], "a")
        expect(file.lastModified >= before && file.lastModified <= Date.now()).toBe(true)
    })

    it("is created from a Gio.File", async () => {
        const gfile = tempFile("{}", "gnim-XXXXXX.json")
        const file = new File(gfile)
        expect(file.name).toBe(gfile.get_basename())
        expect(file.type).toBe("application/json")
        expect(file.size).toBe(2)
        expect(await file.text()).toBe("{}")

        const modified = gfile
            .query_info("time::modified", Gio.FileQueryInfoFlags.NONE, null)
            .get_modification_date_time()!
        expect(Math.trunc(file.lastModified / 1000)).toBe(modified.to_unix())
    })

    it("can rename a Gio.File", () => {
        expect(new File(tempFile("a"), "other.txt").name).toBe("other.txt")
    })
})
