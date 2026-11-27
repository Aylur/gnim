import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { describe, expect, it } from "@gnim-js/assert"
import { Blob, File } from "../lib/blob.js"
import type { BodyInit } from "../lib/body.js"
import { Request } from "../lib/request.js"
import { fromGStream } from "../lib/stream.js"
import { URLSearchParams } from "../lib/url.js"
import { FormData } from "../lib/formdata.js"
import { decoder } from "../lib/lib.js"

const A = "a".charCodeAt(0)
const B = "b".charCodeAt(0)
const C = "c".charCodeAt(0)

async function readStream(input: Gio.InputStream): Promise<string> {
    return Array.fromAsync(fromGStream(input))
        .then((chunks) => chunks.map((chunk) => decoder.decode(chunk)))
        .then((strings) => strings.join(""))
}

describe("Request", () => {
    it("has defaults", () => {
        const request = new Request("https://example.com")
        expect(request.url).toBe("https://example.com/")
        expect(request.method).toBe("GET")
        expect(request.redirect).toBe("follow")
        expect(request.credentials).toBe("same-origin")
        expect(request.signal).toBeNull()
        expect(request.session).toBeNull()
        expect(() => request.body).toThrow("ReadableStream")
        expect(request.bodyUsed).toBe(false)
        expect(Object.prototype.toString.call(request)).toBe("[object Request]")
    })

    it("has defaults for cache and priority", () => {
        const request = new Request("https://a.com")
        expect(request.cache).toBe("default")
        expect(request.priority).toBe("auto")
    })

    it("keeps cache and priority, also from another request and in clones", () => {
        const request = new Request("https://a.com", { cache: "no-store", priority: "high" })
        for (const copy of [request, new Request(request), request.clone()]) {
            expect(copy.cache).toBe("no-store")
            expect(copy.priority).toBe("high")
        }
    })

    it("validates cache, priority and duplex", () => {
        const url = "https://a.com"
        expect(() => new Request(url, { cache: "x" as "default" })).toThrow(TypeError)
        expect(() => new Request(url, { priority: "x" as "auto" })).toThrow(TypeError)
        expect(() => new Request(url, { duplex: "full" as "half" })).toThrow(TypeError)
        expect(new Request(url, { duplex: "half" }).method).toBe("GET")
    })

    it("normalizes and validates methods", () => {
        expect(new Request("https://a.com", { method: "post" }).method).toBe("POST")
        expect(new Request("https://a.com", { method: "patch" }).method).toBe("patch")
        expect(() => new Request("https://a.com", { method: "TRACE" })).toThrow(TypeError)
        expect(() => new Request("https://a.com", { method: "a b" })).toThrow(TypeError)
    })

    it("rejects bodies for GET and HEAD", () => {
        expect(() => new Request("https://a.com", { body: "x" })).toThrow(TypeError)
        expect(() => new Request("https://a.com", { method: "HEAD", body: "x" })).toThrow(TypeError)
    })

    it("validates redirect and credentials", () => {
        const url = "https://a.com"
        expect(() => new Request(url, { redirect: "x" as "follow" })).toThrow(TypeError)
        expect(() => new Request(url, { credentials: "x" as "omit" })).toThrow(TypeError)
    })

    it("sets content-type from the body", () => {
        const post = (body: BodyInit) =>
            new Request("https://a.com", { method: "POST", body }).headers.get("content-type")

        expect(post("x")).toBe("text/plain;charset=UTF-8")
        expect(post(new URLSearchParams("a=1"))).toBe(
            "application/x-www-form-urlencoded;charset=UTF-8",
        )
        expect(post(new Blob([], { type: "image/png" }))).toBe("image/png")
        expect(post(new Uint8Array(1))).toBeNull()

        const request = new Request("https://a.com", {
            method: "POST",
            body: "x",
            headers: { "Content-Type": "text/custom" },
        })
        expect(request.headers.get("content-type")).toBe("text/custom")
    })

    it("reads bodies", async () => {
        const post = (body: string) => new Request("https://a.com", { method: "POST", body })
        expect(await post("hello").text()).toBe("hello")
        expect(await post('{"a":1}').json()).toEqual({ a: 1 })
        expect(await post("ab").bytes()).toEqual(new Uint8Array([A, B]))
        expect((await post("ab").arrayBuffer()).byteLength).toBe(2)

        const blob = await post("hi").blob()
        expect(blob.type).toBe("text/plain;charset=utf-8")
        expect(await blob.text()).toBe("hi")
    })

    it("reads bodies of every kind", async () => {
        async function* chunks() {
            yield "a"
            yield new Uint8Array([B])
        }
        const read = (body: BodyInit) =>
            new Request("https://a.com", { method: "POST", body }).text()

        expect(await read(new GLib.Bytes(new TextEncoder().encode("bytes")))).toBe("bytes")
        expect(await read(new Uint8Array([A]).buffer)).toBe("a")
        expect(await read(new Blob(["blob"]))).toBe("blob")
        expect(await read(chunks())).toBe("ab")
        expect(
            await read(Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new Uint8Array([C])))),
        ).toBe("c")
    })

    it("can only be read once", async () => {
        const request = new Request("https://a.com", { method: "POST", body: "x" })
        await request.text()
        expect(request.bodyUsed).toBe(true)
        await expect(request.text()).rejects.toThrow(TypeError)
        expect(() => request.gstream).toThrow(TypeError)
    })

    it("reads bodies as a Gio.InputStream", async () => {
        async function* chunks() {
            yield "streamed "
            yield "chunks"
        }
        const post = (body: BodyInit) => new Request("https://a.com", { method: "POST", body })

        expect(await readStream(post("text").gstream!)).toBe("text")
        expect(await readStream(post(chunks()).gstream!)).toBe("streamed chunks")
        expect(await readStream(post("").gstream!)).toBe("")

        const empty = new Request("https://a.com")
        expect(empty.gstream).toBeNull()
        expect(empty.bodyUsed).toBe(false)

        const request = post("same")
        expect(request.gstream).toBe(request.gstream)
    })

    it("reads bodies of every kind as chunks", async () => {
        async function* gen() {
            yield "a"
            yield "b"
        }
        const form = new FormData()
        form.append("a", "1")

        const read = async (body: BodyInit | null) => {
            const chunks: string[] = []
            const request = new Request("https://a.com", { method: "POST", body })
            for await (const chunk of request.chunks()) {
                chunks.push(new TextDecoder().decode(chunk))
            }
            return chunks
        }

        expect(await read("text")).toEqual(["text"])
        expect(await read(new Blob(["x", "y"]))).toEqual(["x", "y"])
        expect(await read(gen())).toEqual(["a", "b"])
        expect(await read(null)).toEqual([])
        expect(await read("")).toEqual([])
        expect((await read(form)).join("")).toMatch('name="a"')

        const stream = Gio.MemoryInputStream.new_from_bytes(
            new GLib.Bytes(new TextEncoder().encode("abcde")),
        )
        const request = new Request("https://a.com", { method: "POST", body: stream })
        const chunks: string[] = []
        for await (const chunk of request.chunks(2)) chunks.push(new TextDecoder().decode(chunk))
        expect(chunks).toEqual(["ab", "cd", "e"])
    })

    it("uses the body once chunks is called", async () => {
        const request = new Request("https://a.com", { method: "POST", body: "x" })
        void request.chunks()
        expect(request.bodyUsed).toBe(true)
        await expect(request.text()).rejects.toThrow(TypeError)
        expect(() => request.chunks()).toThrow(TypeError)
    })

    it("validates the chunk size", () => {
        const request = () => new Request("https://a.com", { method: "POST", body: "x" })
        expect(() => request().chunks(0)).toThrow(RangeError)
        expect(() => request().chunks(1.5)).toThrow(RangeError)
    })

    it("rejects chunks that are not strings or Uint8Arrays", async () => {
        async function* chunks() {
            yield 1 as unknown as string
        }
        const request = new Request("https://a.com", { method: "POST", body: chunks() })
        await expect(request.text()).rejects.toThrow(TypeError)
    })

    it("encodes FormData bodies", async () => {
        const body = new FormData()
        body.append("a", "1")
        body.append("file", new Blob(["contents"], { type: "text/csv" }), "a.csv")

        const request = new Request("https://a.com", { method: "POST", body })
        expect(request.headers.get("content-type")).toMatch(/^multipart\/form-data; boundary=/)

        const form = await request.clone().formData()
        expect(form.get("a")).toBe("1")
        expect(await (form.get("file") as File).text()).toBe("contents")
        expect((await request.bytes()).byteLength).toBeGreaterThan(0)
    })

    it("parses form bodies", async () => {
        const request = new Request("https://a.com", {
            method: "POST",
            body: new URLSearchParams("a=1&b=2"),
        })
        const form = await request.formData()
        expect(form.get("a")).toBe("1")
        expect(form.get("b")).toBe("2")
    })

    it("is created from another request", async () => {
        const signal = new Gio.Cancellable()
        const base = new Request("https://a.com", {
            method: "POST",
            body: "x",
            headers: { a: "1" },
            redirect: "manual",
            signal,
        })
        const request = new Request(base, { headers: { b: "2" } })

        expect(request.method).toBe("POST")
        expect(request.redirect).toBe("manual")
        expect(request.signal).toBe(signal)
        expect(request.headers.has("a")).toBe(false)
        expect(request.headers.get("b")).toBe("2")
        expect(base.bodyUsed).toBe(true)
        expect(await request.text()).toBe("x")
        expect(() => new Request(base)).toThrow(TypeError)
    })

    it("clones in memory bodies", async () => {
        const request = new Request("https://a.com", { method: "POST", body: "x" })
        const clone = request.clone()
        expect(await clone.text()).toBe("x")
        expect(await request.text()).toBe("x")
    })

    it("clones streamed bodies", async () => {
        async function* chunks() {
            yield "a"
            yield "b"
        }
        const request = new Request("https://a.com", { method: "POST", body: chunks() })
        const clone = request.clone()
        const [a, b] = await Promise.all([request.text(), clone.text()])
        expect(a).toBe("ab")
        expect(b).toBe("ab")
    })

    it("cannot clone a used body", async () => {
        const request = new Request("https://a.com", { method: "POST", body: "x" })
        await request.text()
        expect(() => request.clone()).toThrow(TypeError)
    })
})
