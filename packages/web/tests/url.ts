import GLib from "gi://GLib?version=2.0"
import { describe, expect, it } from "@gnim-js/assert"
import { URL, URLSearchParams } from "../lib/url.js"

describe("URL", () => {
    it("accepts a GLib.Uri", () => {
        const uri = GLib.Uri.parse("HTTP://user@example.com:80/a b?q=1#h", GLib.UriFlags.NONE)
        expect(new URL(uri).href).toBe("http://user@example.com/a%20b?q=1#h")
    })

    describe("parsing", () => {
        it("splits a URL into its components", () => {
            const url = new URL("https://user:pass@Example.COM:8080/a/../b?x=1#frag")
            expect(url.href).toBe("https://user:pass@example.com:8080/b?x=1#frag")
            expect(url.origin).toBe("https://example.com:8080")
            expect(url.protocol).toBe("https:")
            expect(url.username).toBe("user")
            expect(url.password).toBe("pass")
            expect(url.host).toBe("example.com:8080")
            expect(url.hostname).toBe("example.com")
            expect(url.port).toBe("8080")
            expect(url.pathname).toBe("/b")
            expect(url.search).toBe("?x=1")
            expect(url.hash).toBe("#frag")
            expect(url.searchParams.get("x")).toBe("1")
        })

        it("omits default ports", () => {
            expect(new URL("https://a.com:443/").port).toBe("")
            expect(new URL("https://a.com:443/").href).toBe("https://a.com/")
            expect(new URL("ws://a.com:80").host).toBe("a.com")
        })

        it("normalizes special URLs like browsers", () => {
            expect(new URL("http://a.com").href).toBe("http://a.com/")
            expect(new URL("http:\\\\a.com\\x").href).toBe("http://a.com/x")
            expect(new URL("http:a.com").href).toBe("http://a.com/")
            expect(new URL("  http://a.com/\n ").href).toBe("http://a.com/")
        })

        it("punycodes IDNA hosts", () => {
            expect(new URL("http://ä.com/").hostname).toBe("xn--4ca.com")
        })

        it("escapes invalid percent escapes", () => {
            expect(new URL("http://a.com/%zz").pathname).toBe("/%25zz")
        })

        it("brackets IPv6 hosts", () => {
            const url = new URL("http://[::1]:3000/")
            expect(url.hostname).toBe("[::1]")
            expect(url.host).toBe("[::1]:3000")
            expect(url.href).toBe("http://[::1]:3000/")
        })

        it("supports opaque paths", () => {
            const url = new URL("mailto:a@b.c")
            expect(url.pathname).toBe("a@b.c")
            expect(url.host).toBe("")
            expect(url.origin).toBe("null")
        })

        it("supports file URLs", () => {
            const url = new URL("file:///tmp/x")
            expect(url.href).toBe("file:///tmp/x")
            expect(url.hostname).toBe("")
            expect(url.origin).toBe("null")
        })
    })

    describe("base resolution", () => {
        it("resolves relative references", () => {
            expect(new URL("../c?d", "http://a.com/x/y/z").href).toBe("http://a.com/x/c?d")
            expect(new URL("//b.org/x", "https://a.com/").href).toBe("https://b.org/x")
        })

        it("ignores the base for absolute URLs", () => {
            expect(new URL("http://b.org/", "http://a.com/").href).toBe("http://b.org/")
        })

        it("accepts URL objects", () => {
            expect(new URL("/p", new URL("http://a.com/q")).href).toBe("http://a.com/p")
            expect(new URL(new URL("http://a.com/")).href).toBe("http://a.com/")
        })
    })

    describe("errors", () => {
        it("throws a TypeError on invalid input", () => {
            expect(() => new URL("nope")).toThrow(TypeError)
            expect(() => new URL("http://exa mple.com")).toThrow(TypeError)
            expect(() => new URL("http://a.com:99999")).toThrow(TypeError)
            expect(() => new URL("x", "nope")).toThrow(TypeError)
        })

        it("canParse", () => {
            expect(URL.canParse("http://a.com")).toBe(true)
            expect(URL.canParse("nope")).toBe(false)
            expect(URL.canParse("x", "http://a.com")).toBe(true)
        })

        it("parse returns null instead of throwing", () => {
            expect(URL.parse("nope")).toBeNull()
            expect(URL.parse("/x", "http://a.com")?.href).toBe("http://a.com/x")
        })
    })

    describe("setters", () => {
        it("protocol", () => {
            const url = new URL("http://a.com/p?x=1#h")
            url.protocol = "https"
            expect(url.href).toBe("https://a.com/p?x=1#h")
            url.protocol = "mailto"
            expect(url.protocol).toBe("https:")
        })

        it("hostname and host", () => {
            const url = new URL("http://a.com/")
            url.hostname = "b.org"
            expect(url.host).toBe("b.org")
            url.hostname = "bad host"
            expect(url.hostname).toBe("b.org")
            url.host = "c.net:81"
            expect(url.host).toBe("c.net:81")
        })

        it("port", () => {
            const url = new URL("https://b.org/p?x=1#h")
            url.port = "8080"
            expect(url.href).toBe("https://b.org:8080/p?x=1#h")
            url.port = "443"
            expect(url.port).toBe("")
            url.port = "99999"
            expect(url.port).toBe("")
        })

        it("username and password escape", () => {
            const url = new URL("https://c.net:81/p")
            url.username = "us er"
            url.password = "p@ss"
            expect(url.href).toBe("https://us%20er:p%40ss@c.net:81/p")
        })

        it("pathname escapes and adds a leading slash", () => {
            const url = new URL("http://a.com/")
            url.pathname = "a b/c"
            expect(url.pathname).toBe("/a%20b/c")
        })

        it("search and hash escape", () => {
            const url = new URL("http://a.com/")
            url.search = "?q=1 2"
            expect(url.search).toBe("?q=1%202")
            expect(url.searchParams.get("q")).toBe("1 2")

            url.hash = "frag ment"
            expect(url.hash).toBe("#frag%20ment")
        })

        it("empty search and hash are removed", () => {
            const url = new URL("http://a.com/p?x=1#h")
            url.hash = ""
            url.search = ""
            expect(url.href).toBe("http://a.com/p")
            expect(url.searchParams.size).toBe(0)
        })

        it("href", () => {
            const url = new URL("http://a.com/")
            url.href = "http://z.com/?k=v"
            expect(url.searchParams.get("k")).toBe("v")
            expect(() => (url.href = "nope")).toThrow(TypeError)
        })

        it("opaque URLs ignore path and host setters", () => {
            const url = new URL("mailto:a@b.c")
            url.pathname = "x"
            url.host = "d.com"
            expect(url.href).toBe("mailto:a@b.c")
        })
    })

    describe("searchParams", () => {
        it("is the same instance", () => {
            const url = new URL("http://a.com/")
            expect(url.searchParams).toBe(url.searchParams)
        })

        it("mutations update the query", () => {
            const url = new URL("http://a.com/?x=1")
            url.searchParams.append("a", "b c")
            expect(url.search).toBe("?x=1&a=b+c")

            url.searchParams.delete("x")
            url.searchParams.delete("a")
            expect(url.href).toBe("http://a.com/")
        })

        it("follows search updates", () => {
            const url = new URL("http://a.com/")
            const params = url.searchParams
            url.search = "y=2"
            expect(params.get("y")).toBe("2")
        })
    })

    it("serializes with toString and toJSON", () => {
        expect(String(new URL("http://a.com"))).toBe("http://a.com/")
        expect(JSON.stringify({ u: new URL("http://a.com") })).toBe('{"u":"http://a.com/"}')
    })
})

describe("URLSearchParams", () => {
    it("reads values", () => {
        const params = new URLSearchParams("?a=1&b=2&a=3")
        expect(params.get("a")).toBe("1")
        expect(params.getAll("a")).toEqual(["1", "3"])
        expect(params.get("missing")).toBeNull()
        expect(params.size).toBe(3)
    })

    it("iterates pairs in order", () => {
        const params = new URLSearchParams("a=1&b=2&a=3")
        expect([...params]).toEqual([
            ["a", "1"],
            ["b", "2"],
            ["a", "3"],
        ])
        expect([...params.keys()]).toEqual(["a", "b", "a"])
        expect([...params.values()]).toEqual(["1", "2", "3"])
    })

    it("decodes leniently", () => {
        const params = new URLSearchParams("q=a+b%20c&x=%zz&y=%FF%41%&z=%e2%82%ac€&empty&=v")
        expect(params.get("q")).toBe("a b c")
        expect(params.get("x")).toBe("%zz")
        expect(params.get("y")).toBe("\uFFFDA%")
        expect(params.get("z")).toBe("€€")
        expect(params.get("empty")).toBe("")
        expect(params.get("")).toBe("v")
    })

    it("form-urlencodes on serialize", () => {
        const params = new URLSearchParams({ q: "a b&c=d/é", x: "*-._~" })
        expect(params.toString()).toBe("q=a+b%26c%3Dd%2F%C3%A9&x=*-._%7E")
        expect(new URLSearchParams(params.toString()).get("q")).toBe("a b&c=d/é")
    })

    it("set replaces the first pair and removes the rest", () => {
        const params = new URLSearchParams([
            ["a", "1"],
            ["b", "2"],
            ["a", "3"],
        ])
        params.set("a", "9")
        expect(params.toString()).toBe("a=9&b=2")
    })

    it("delete and has with a value only match that pair", () => {
        const params = new URLSearchParams("c=1&c=2")
        params.delete("c", "1")
        expect(params.getAll("c")).toEqual(["2"])
        expect(params.has("c", "2")).toBe(true)
        expect(params.has("c", "1")).toBe(false)

        params.delete("c")
        expect(params.has("c")).toBe(false)
    })

    it("sort is stable", () => {
        const params = new URLSearchParams("c=1&a=2&b=3&a=1")
        params.sort()
        expect(params.toString()).toBe("a=2&a=1&b=3&c=1")
    })

    it("copies are independent", () => {
        const original = new URLSearchParams("a=1")
        new URLSearchParams(original).append("b", "2")
        expect(original.toString()).toBe("a=1")
    })
})
