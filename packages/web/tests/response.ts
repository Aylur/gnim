import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { afterAll, describe, expect, it } from "@gnim-js/assert"
import { Response } from "../lib/response.js"
import { encoder } from "../lib/lib.js"

const files: Gio.File[] = []

afterAll(() => {
    for (const file of files) file.delete(null)
})

describe("Response", () => {
    it("has defaults", async () => {
        const response = new Response()
        expect(response.status).toBe(200)
        expect(response.statusText).toBe("")
        expect(response.ok).toBe(true)
        expect(response.type).toBe("default")
        expect(response.url).toBe("")
        expect(response.redirected).toBe(false)
        expect(() => response.body).toThrow("ReadableStream")
        expect(await response.text()).toBe("")
        expect(Object.prototype.toString.call(response)).toBe("[object Response]")
    })

    it("validates status and status text", () => {
        expect(() => new Response(null, { status: 199 })).toThrow(RangeError)
        expect(() => new Response(null, { status: 600 })).toThrow(RangeError)
        expect(() => new Response(null, { statusText: "a\nb" })).toThrow(TypeError)
        expect(new Response(null, { status: 404 }).ok).toBe(false)
    })

    it("rejects bodies for null body statuses", () => {
        expect(() => new Response("x", { status: 204 })).toThrow(TypeError)
        expect(new Response(null, { status: 204 }).status).toBe(204)
    })

    it("creates errors", () => {
        const response = Response.error()
        expect(response.status).toBe(0)
        expect(response.type).toBe("error")
        expect(() => response.headers.set("a", "b")).toThrow(TypeError)
    })

    it("creates JSON responses", async () => {
        const response = Response.json({ a: 1 }, { status: 201 })
        expect(response.status).toBe(201)
        expect(response.headers.get("content-type")).toBe("application/json")
        expect(await response.json()).toEqual({ a: 1 })
        expect(() => Response.json(() => 1)).toThrow(TypeError)
    })

    it("creates redirects", () => {
        const response = Response.redirect("https://a.com/b", 301)
        expect(response.status).toBe(301)
        expect(response.headers.get("location")).toBe("https://a.com/b")
        expect(() => Response.redirect("https://a.com", 200)).toThrow(RangeError)
        expect(() => response.headers.set("a", "b")).toThrow(TypeError)
    })

    it("clones with state and headers", async () => {
        const response = Response.redirect("https://a.com")
        const clone = response.clone()
        expect(clone.status).toBe(302)
        expect(() => clone.headers.set("a", "b")).toThrow(TypeError)

        const text = new Response("x")
        expect(await text.clone().text()).toBe("x")
        expect(await text.text()).toBe("x")
    })

    it("streams a Gio.File body from disk", async () => {
        const [file, stream] = Gio.File.new_tmp("gnim-XXXXXX.json")
        stream.close(null)
        file.replace_contents(encoder.encode("[1]"), null, false, 0, null)
        files.push(file)

        const response = new Response(file)
        expect(response.headers.get("content-type")).toBe("application/json")
        expect(response.gstream).toBeInstanceOf(Gio.FileInputStream)

        const blob = await new Response(file).blob()
        expect(blob.size).toBe(3)
        expect(await blob.text()).toBe("[1]")
    })

    it("rejects redirects to invalid URLs", () => {
        expect(() => Response.redirect("not a url")).toThrow(TypeError)
    })

    it("keeps the init of JSON responses", async () => {
        const response = Response.json(
            { a: 1 },
            { status: 202, statusText: "Accepted", headers: { "Content-Type": "application/x" } },
        )
        expect(response.status).toBe(202)
        expect(response.statusText).toBe("Accepted")
        expect(response.headers.get("content-type")).toBe("application/x")
        expect(await response.json()).toEqual({ a: 1 })
    })

    it("keeps status text and headers", () => {
        const response = new Response("x", { statusText: "Fine", headers: [["x-a", "1"]] })
        expect(response.statusText).toBe("Fine")
        expect(response.headers.get("x-a")).toBe("1")
        expect(response.headers.get("content-type")).toBe("text/plain;charset=UTF-8")
    })

    it("clones streamed bodies", async () => {
        async function* chunks() {
            yield "a"
            yield "b"
        }
        const response = new Response(chunks())
        const clone = response.clone()
        expect(await Promise.all([response.text(), clone.text()])).toEqual(["ab", "ab"])

        const stream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(encoder.encode("gio")))
        const gio = new Response(stream)
        const gioClone = gio.clone()
        expect(await gioClone.text()).toBe("gio")
        expect(await gio.text()).toBe("gio")
    })

    it("cannot be cloned once read", async () => {
        const response = new Response("x")
        await response.text()
        expect(() => response.clone()).toThrow(TypeError)
    })
})
