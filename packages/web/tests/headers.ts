import Soup from "gi://Soup?version=3.0"
import { describe, expect, it } from "@gnim-js/assert"
import { Headers, freezeHeaders } from "../lib/headers.js"

describe("Headers", () => {
    it("names are case insensitive", () => {
        const headers = new Headers({ "Content-Type": "text/plain" })
        expect(headers.get("content-type")).toBe("text/plain")
        expect(headers.has("CONTENT-TYPE")).toBe(true)
    })

    it("combines, replaces and deletes values", () => {
        const headers = new Headers()
        headers.append("Accept", "a")
        headers.append("accept", "b")
        expect(headers.get("Accept")).toBe("a, b")

        headers.set("accept", "c")
        expect(headers.get("accept")).toBe("c")

        headers.delete("Accept")
        expect(headers.has("accept")).toBe(false)
        expect(headers.get("accept")).toBeNull()
    })

    it("iterates sorted and combined, except set-cookie", () => {
        const headers = new Headers([
            ["B", "2"],
            ["a", "1"],
            ["Set-Cookie", "x=1"],
            ["set-cookie", "y=2"],
            ["b", "3"],
        ])
        expect([...headers]).toEqual([
            ["a", "1"],
            ["b", "2, 3"],
            ["set-cookie", "x=1"],
            ["set-cookie", "y=2"],
        ])
        expect(headers.getSetCookie()).toEqual(["x=1", "y=2"])
    })

    it("trims values", () => {
        expect(new Headers({ a: "  x \t" }).get("a")).toBe("x")
    })

    it("validates names and values", () => {
        expect(() => new Headers({ "a b": "x" })).toThrow(TypeError)
        expect(() => new Headers({ a: "x\ny" })).toThrow(TypeError)
    })

    it("copies are independent", () => {
        const original = new Headers({ a: "1" })
        new Headers(original).set("a", "2")
        expect(original.get("a")).toBe("1")
    })

    it("copies Soup.MessageHeaders", () => {
        const soup = new Soup.MessageHeaders(Soup.MessageHeadersType.RESPONSE)
        soup.append("X-Foo", "a")
        soup.append("x-foo", "b")
        soup.append("Set-Cookie", "c=1")
        soup.append("Set-Cookie", "d=2")

        const headers = new Headers(soup)
        soup.remove("x-foo")

        expect(headers.get("x-foo")).toBe("a, b")
        expect(headers.getSetCookie()).toEqual(["c=1", "d=2"])
    })

    it("immutable headers throw", () => {
        const headers = new Headers()
        freezeHeaders(headers)
        expect(() => headers.set("a", "b")).toThrow("immutable")
    })
})
