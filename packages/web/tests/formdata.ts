import Gio from "gi://Gio?version=2.0"
import { afterAll, describe, expect, it } from "@gnim-js/assert"
import { Blob, File } from "../lib/blob.js"
import { FormData, decodeFormData, encodeFormData } from "../lib/formdata.js"
import { collect } from "../lib/lib.js"

const files: Gio.File[] = []

afterAll(() => {
    for (const file of files) file.delete(null)
})

function tempFile(contents: string): Gio.File {
    const [file, stream] = Gio.File.new_tmp("gnim-XXXXXX.txt")
    stream.close(null)
    file.replace_contents(new TextEncoder().encode(contents), null, false, 0, null)
    files.push(file)
    return file
}

describe("FormData", () => {
    it("appends, gets and deletes entries", () => {
        const form = new FormData()
        form.append("a", "1")
        form.append("b", "2")
        form.append("a", "3")

        expect(form.get("a")).toBe("1")
        expect(form.getAll("a")).toEqual(["1", "3"])
        expect(form.has("b")).toBe(true)
        expect(form.get("c")).toBeNull()

        form.delete("a")
        expect(form.has("a")).toBe(false)
        expect([...form.keys()]).toEqual(["b"])
    })

    it("set replaces the first entry and removes the rest", () => {
        const form = new FormData()
        form.append("a", "1")
        form.append("b", "2")
        form.append("a", "3")
        form.set("a", "4")
        form.set("c", "5")
        expect([...form]).toEqual([
            ["a", "4"],
            ["b", "2"],
            ["c", "5"],
        ])
    })

    it("turns blobs into files", () => {
        const form = new FormData()
        form.append("blob", new Blob(["x"], { type: "text/plain" }))
        form.append("named", new Blob(["x"]), "x.txt")

        const blob = form.get("blob") as File
        expect(blob).toBeInstanceOf(File)
        expect(blob.name).toBe("blob")
        expect(blob.type).toBe("text/plain")
        expect((form.get("named") as File).name).toBe("x.txt")
    })

    it("keeps files, unless they are renamed", () => {
        const file = new File(["x"], "a.txt", { lastModified: 1 })
        const form = new FormData()
        form.append("same", file)
        form.append("renamed", file, "b.txt")

        expect(form.get("same")).toBe(file)
        const renamed = form.get("renamed") as File
        expect(renamed.name).toBe("b.txt")
        expect(renamed.lastModified).toBe(1)
    })

    it("accepts a Gio.File", async () => {
        const gfile = tempFile("contents")
        const form = new FormData()
        form.append("file", gfile)
        form.append("renamed", gfile, "other.txt")

        const file = form.get("file") as File
        expect(file.name).toBe(gfile.get_basename())
        expect(file.type).toBe("text/plain")
        expect(await file.text()).toBe("contents")
        expect((form.get("renamed") as File).name).toBe("other.txt")
    })

    it("iterates with forEach, entries and values", () => {
        const form = new FormData()
        form.append("a", "1")
        form.append("b", "2")

        const seen: string[] = []
        form.forEach((value, name, parent) => {
            expect(parent).toBe(form)
            seen.push(`${name}=${value}`)
        })
        expect(seen).toEqual(["a=1", "b=2"])
        expect([...form.values()]).toEqual(["1", "2"])
        expect(Object.prototype.toString.call(form)).toBe("[object FormData]")
    })
})

describe("encodeFormData", () => {
    it("encodes multipart/form-data", async () => {
        const form = new FormData()
        form.append('na"me', "line\nbreak")
        form.append("file", new File(["contents"], "a\r.txt", { type: "text/plain" }))
        form.append("untyped", new Blob(["x"]))

        const { chunks, contentType, length } = encodeFormData(form)
        const boundary = contentType.split("boundary=")[1]!
        expect(contentType).toMatch(/^multipart\/form-data; boundary=/)

        const body = await collect(chunks())
        expect(body.byteLength).toBe(length)
        expect(new TextDecoder().decode(body)).toBe(
            `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="na%22me"\r\n\r\n` +
                `line\r\nbreak\r\n` +
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="file"; filename="a%0D.txt"\r\n` +
                `Content-Type: text/plain\r\n\r\n` +
                `contents\r\n` +
                `--${boundary}\r\n` +
                `Content-Disposition: form-data; name="untyped"; filename="blob"\r\n` +
                `Content-Type: application/octet-stream\r\n\r\n` +
                `x\r\n` +
                `--${boundary}--\r\n`,
        )
    })

    it("reads files while the body is read", async () => {
        const gfile = tempFile("before")
        const form = new FormData()
        form.append("file", gfile)
        const { chunks, length } = encodeFormData(form)

        gfile.replace_contents(new TextEncoder().encode("after!"), null, false, 0, null)
        const body = new TextDecoder().decode(await collect(chunks()))
        expect(body).toMatch("after!")
        expect(body.length).toBe(length)
    })

    it("fails when a file got shorter", async () => {
        const gfile = tempFile("contents")
        const form = new FormData()
        form.append("file", gfile)
        const { chunks } = encodeFormData(form)

        gfile.replace_contents(new TextEncoder().encode("x"), null, false, 0, null)
        await expect(collect(chunks())).rejects.toThrow("changed")
    })

    it("round trips through decodeFormData", async () => {
        const form = new FormData()
        form.append("a", "1")
        form.append("file", tempFile("on disk"))

        const { chunks, contentType } = encodeFormData(form)
        const decoded = decodeFormData(await collect(chunks()), contentType)
        expect(decoded.get("a")).toBe("1")
        expect(await (decoded.get("file") as File).text()).toBe("on disk")
    })
})

describe("decodeFormData", () => {
    it("decodes multipart/form-data", async () => {
        const body =
            "--b\r\n" +
            'Content-Disposition: form-data; name="a"\r\n\r\n' +
            "1\r\n" +
            "--b\r\n" +
            'Content-Disposition: form-data; name="file"; filename="a.txt"\r\n' +
            "Content-Type: text/csv\r\n\r\n" +
            "contents\r\n" +
            "--b\r\n" +
            'Content-Disposition: form-data; name="untyped"; filename="b"\r\n\r\n' +
            "x\r\n" +
            "--b--\r\n"
        const decoded = decodeFormData(
            new TextEncoder().encode(body),
            "multipart/form-data; boundary=b",
        )

        expect(decoded.get("a")).toBe("1")
        const file = decoded.get("file") as File
        expect(file.name).toBe("a.txt")
        expect(file.type).toBe("text/csv")
        expect(await file.text()).toBe("contents")
        expect((decoded.get("untyped") as File).type).toBe("text/plain")
    })

    it("decodes application/x-www-form-urlencoded", () => {
        const bytes = new TextEncoder().encode("a=1&b=hello+world&a=2")
        const form = decodeFormData(bytes, "application/x-www-form-urlencoded;charset=UTF-8")
        expect(form.getAll("a")).toEqual(["1", "2"])
        expect(form.get("b")).toBe("hello world")
    })

    it("rejects other content types", () => {
        expect(() => decodeFormData(new Uint8Array(0), "text/plain")).toThrow(TypeError)
        expect(() => decodeFormData(new Uint8Array(0), null)).toThrow(TypeError)
    })
})
