import { afterAll, describe, expect, it } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import System from "system"
import { Blob, File } from "../lib/blob.js"
import { fetch } from "../lib/fetch.js"
import { FormData, decodeFormData } from "../lib/formdata.js"
import { concat } from "../lib/lib.js"
import { Request, type RequestCache, type RequestInit } from "../lib/request.js"
import { Response } from "../lib/response.js"
import certFile from "./cert/cert.pem?file"
import keyFile from "./cert/key.pem?file"
import { pattern, sha256, startServer } from "./server.js"

const server = startServer()

afterAll(() => server.stop())

interface Echo {
    method: string
    headers: Record<string, string>
    body: string
}

function isCancelled(error: unknown): boolean {
    return error instanceof GLib.Error && error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED)
}

describe("fetch", () => {
    it("fetches text", async () => {
        const response = await fetch(server.url("/text"))
        expect(response.status).toBe(200)
        expect(response.statusText).toBe("OK")
        expect(response.ok).toBe(true)
        expect(response.type).toBe("basic")
        expect(response.url).toBe(server.url("/text"))
        expect(response.headers.get("content-type")).toBe("text/plain")
        expect(await response.text()).toBe("hello")
    })

    it("leaves the fragment out of the response URL", async () => {
        const response = await fetch(server.url("/text#fragment"))
        expect(response.url).toBe(server.url("/text"))
        expect(response.redirected).toBe(false)
    })

    it("sends method, headers and body", async () => {
        const response = await fetch(server.url("/echo"), {
            method: "PUT",
            headers: { "X-Test": "1" },
            body: JSON.stringify({ a: 1 }),
        })
        const echo = await response.json<Echo>()
        expect(echo.method).toBe("PUT")
        expect(echo.headers["x-test"]).toBe("1")
        expect(echo.headers["content-type"]).toBe("text/plain;charset=UTF-8")
        expect(echo.body).toBe('{"a":1}')
    })

    it("accepts a Request", async () => {
        const request = new Request(server.url("/echo"), { method: "POST", body: "req" })
        const echo = await (await fetch(request)).json<Echo>()
        expect(echo.body).toBe("req")
    })

    it("streams bodies produced in JS", async () => {
        async function* chunks() {
            yield "streamed "
            await new Promise<void>((resolve) => setTimeout(resolve, 10))
            yield "body"
        }
        const response = await fetch(server.url("/echo"), { method: "POST", body: chunks() })
        const echo = await response.json<Echo>()
        expect(echo.body).toBe("streamed body")
        expect(echo.headers["transfer-encoding"]).toBe("chunked")
    })

    it("sends blobs with their length", async () => {
        const body = new Blob(["blob ", "body"], { type: "text/x-blob" })
        const echo = await (await fetch(server.url("/echo"), { method: "POST", body })).json<Echo>()
        expect(echo.body).toBe("blob body")
        expect(echo.headers["content-length"]).toBe("9")
        expect(echo.headers["content-type"]).toBe("text/x-blob")
    })

    it("streams FormData with its length", async () => {
        const [gfile, stream] = Gio.File.new_tmp("gnim-XXXXXX.txt")
        stream.close(null)
        gfile.replace_contents(new TextEncoder().encode("from disk"), null, false, 0, null)

        const body = new FormData()
        body.append("a", "1")
        body.append("file", gfile)
        const echo = await (await fetch(server.url("/echo"), { method: "POST", body })).json<Echo>()
        gfile.delete(null)

        const contentType = echo.headers["content-type"]!
        expect(contentType).toMatch(/^multipart\/form-data; boundary=/)
        expect(echo.headers["transfer-encoding"]).toBeFalsy()
        expect(Number(echo.headers["content-length"])).toBe(echo.body.length)

        const form = decodeFormData(new TextEncoder().encode(echo.body), contentType)
        expect(form.get("a")).toBe("1")
        expect((form.get("file") as File).name).toBe(gfile.get_basename())
        expect(await (form.get("file") as File).text()).toBe("from disk")
    })

    it("sends a Gio.InputStream", async () => {
        const body = Gio.MemoryInputStream.new_from_bytes(
            new GLib.Bytes(new TextEncoder().encode("gstream")),
        )
        const echo = await (await fetch(server.url("/echo"), { method: "POST", body })).json<Echo>()
        expect(echo.body).toBe("gstream")
    })

    it("fails with the error of a body that failed", async () => {
        async function* chunks() {
            yield "partial"
            throw new Error("boom")
        }
        const error = await fetch(server.url("/echo"), { method: "POST", body: chunks() }).catch(
            (e: unknown) => e,
        )
        expect(error).toBeInstanceOf(TypeError)
        expect((error as TypeError).cause).toEqual(new Error("boom"))
    })

    it("sends bodies on a new connection, because Soup retries them without the body", async () => {
        const session = new Soup.Session()
        const warm = async () => (await fetch(server.url("/text"), { session })).text()
        async function* chunks() {
            yield "chunked"
        }

        // a request without a body reuses the connection, is dropped and retried by Soup
        await warm()
        const before = server.dropped()
        await (await fetch(server.url("/drop"), { session })).text()
        expect(server.dropped()).toBe(before + 1)

        for (const body of ["bytes", chunks()]) {
            await warm()
            const response = await fetch(server.url("/drop"), { method: "PUT", body, session })
            expect(await response.text()).toBe(typeof body === "string" ? body : "chunked")
        }
        expect(server.dropped()).toBe(before + 1)
    })

    it("streams the response", async () => {
        const response = await fetch(server.url("/stream"))
        const chunks: string[] = []
        for await (const chunk of response.chunks()) {
            chunks.push(new TextDecoder().decode(chunk))
        }
        expect(chunks.join("")).toBe("one two three")
        expect(chunks.length).toBeGreaterThan(1)
    })

    it("reads the response in chunks of at most chunkSize", async () => {
        const response = await fetch(server.url("/text"))
        const chunks: string[] = []
        for await (const chunk of response.chunks(2)) chunks.push(new TextDecoder().decode(chunk))
        expect(chunks).toEqual(["he", "ll", "o"])
    })

    it("cancels reading chunks with signal", async () => {
        const signal = new Gio.Cancellable()
        const response = await fetch(server.url("/stream"), { signal })
        const read = async () => {
            for await (const chunk of response.chunks()) {
                expect(chunk.byteLength).toBeGreaterThan(0)
                signal.cancel()
            }
        }
        const error = await read().catch((e: unknown) => e)
        expect(isCancelled(error)).toBe(true)
    })

    it("streams the response through gstream", async () => {
        const response = await fetch(server.url("/stream"))
        expect(response.gstream).toBeInstanceOf(Gio.InputStream)
        expect(await new Response(response.gstream).text()).toBe("one two three")
    })

    it("follows redirects", async () => {
        const response = await fetch(server.url("/redirect"))
        expect(response.redirected).toBe(true)
        expect(response.url).toBe(server.url("/text"))
        expect(await response.text()).toBe("hello")
    })

    describe("307 and 308 redirects with a body", () => {
        const redirect = (code: number, to: string) =>
            server.url(`/redirect-to?code=${code}&to=${encodeURIComponent(to)}`)

        it("sends the body again", async () => {
            for (const code of [307, 308]) {
                const response = await fetch(redirect(code, "/echo"), { method: "PUT", body: "x" })
                expect(response.status).toBe(200)
                expect(response.redirected).toBe(true)
                expect(response.url).toBe(server.url("/echo"))

                const echo = await response.json<Echo>()
                expect(echo.method).toBe("PUT")
                expect(echo.body).toBe("x")
            }
        })

        it("sends blobs and FormData again", async () => {
            const blob = new Blob(["blob"], { type: "text/x-blob" })
            const echo = await (
                await fetch(redirect(307, "/echo"), { method: "POST", body: blob })
            ).json<Echo>()
            expect(echo.body).toBe("blob")
            expect(echo.headers["content-type"]).toBe("text/x-blob")

            const body = new FormData()
            body.append("a", "1")
            const form = await (
                await fetch(redirect(308, "/echo"), { method: "POST", body })
            ).json<Echo>()
            const decoded = decodeFormData(
                new TextEncoder().encode(form.body),
                form.headers["content-type"]!,
            )
            expect(decoded.get("a")).toBe("1")
        })

        it("follows redirects that Soup follows afterwards", async () => {
            const to = redirect(302, "/text")
            const response = await fetch(redirect(307, to), { method: "POST", body: "x" })
            expect(response.redirected).toBe(true)
            expect(await response.text()).toBe("hello")
        })

        it("fails for streamed bodies", async () => {
            async function* chunks() {
                yield "x"
            }
            await expect(
                fetch(redirect(307, "/echo"), { method: "POST", body: chunks() }),
            ).rejects.toThrow("streamed body")

            const stream = Gio.MemoryInputStream.new_from_bytes(new GLib.Bytes(new Uint8Array(1)))
            await expect(
                fetch(redirect(308, "/echo"), { method: "POST", body: stream }),
            ).rejects.toThrow("streamed body")
        })

        it("fails after 20 redirects", async () => {
            let url = server.url("/echo")
            for (let i = 0; i < 21; i++) url = redirect(307, url)
            await expect(fetch(url, { method: "POST", body: "x" })).rejects.toThrow(
                "too many redirects",
            )

            url = server.url("/echo")
            for (let i = 0; i < 20; i++) url = redirect(307, url)
            const echo = await (await fetch(url, { method: "POST", body: "x" })).json<Echo>()
            expect(echo.body).toBe("x")
        })

        it("drops authorization for other origins", async () => {
            const headers = { authorization: "secret" }
            const same = await (
                await fetch(redirect(307, "/echo"), { method: "POST", body: "x", headers })
            ).json<Echo>()
            expect(same.headers.authorization).toBe("secret")

            const other = server.url("/echo").replace("127.0.0.1", "localhost")
            const cross = await (
                await fetch(redirect(307, other), { method: "POST", body: "x", headers })
            ).json<Echo>()
            expect(cross.body).toBe("x")
            expect(cross.headers.authorization).toBeFalsy()
        })

        it("is not followed with redirect: manual", async () => {
            const response = await fetch(redirect(307, "/echo"), {
                method: "POST",
                body: "x",
                redirect: "manual",
            })
            expect(response.status).toBe(307)
        })
    })

    it("returns redirects with redirect: manual", async () => {
        const response = await fetch(server.url("/redirect"), { redirect: "manual" })
        expect(response.status).toBe(302)
        expect(response.redirected).toBe(false)
        expect(response.headers.get("location")).toBe(server.url("/text"))
    })

    it("fails on redirects with redirect: error", async () => {
        await expect(fetch(server.url("/redirect"), { redirect: "error" })).rejects.toThrow(
            TypeError,
        )
    })

    it("resolves with error statuses", async () => {
        const response = await fetch(server.url("/status?code=404"))
        expect(response.status).toBe(404)
        expect(response.ok).toBe(false)
        expect(await response.text()).toBe("status")
    })

    it("has no body for null body statuses and HEAD", async () => {
        const noContent = await fetch(server.url("/status?code=204"))
        expect(noContent.status).toBe(204)
        expect(await noContent.text()).toBe("")

        const head = await fetch(server.url("/text"), { method: "HEAD" })
        expect(head.gstream).toBeNull()
        expect(await head.text()).toBe("")
    })

    it("freezes the response headers", async () => {
        const response = await fetch(server.url("/text"))
        expect(() => response.headers.set("a", "b")).toThrow(TypeError)
        await response.text()
    })

    it("rejects network errors with a TypeError", async () => {
        await expect(fetch("http://127.0.0.1:1/")).rejects.toThrow(TypeError)
    })

    it("is cancelled with signal", async () => {
        const signal = new Gio.Cancellable()
        setTimeout(() => signal.cancel(), 50)
        const error = await fetch(server.url("/slow"), { signal }).catch((e: unknown) => e)
        expect(isCancelled(error)).toBe(true)

        const cancelled = new Gio.Cancellable()
        cancelled.cancel()
        const early = await fetch(server.url("/text"), { signal: cancelled }).catch(
            (e: unknown) => e,
        )
        expect(isCancelled(early)).toBe(true)
    })

    it("cancels reading the body with signal", async () => {
        const signal = new Gio.Cancellable()
        const response = await fetch(server.url("/stream"), { signal })
        signal.cancel()
        const error = await response.text().catch((e: unknown) => e)
        expect(isCancelled(error)).toBe(true)
    })

    it("uses the cookies of a session, unless credentials is omit", async () => {
        const session = new Soup.Session()
        session.add_feature(new Soup.CookieJar())

        await (await fetch(server.url("/cookie/set"), { session })).text()
        const sent = await fetch(server.url("/cookie/get"), { session })
        expect(await sent.text()).toBe("a=1")

        const omitted = await fetch(server.url("/cookie/get"), { session, credentials: "omit" })
        expect(await omitted.text()).toBe("")
    })

    it("sets the priority of the message", async () => {
        const session = new Soup.Session()
        const priorities: Soup.MessagePriority[] = []
        session.connect("request-queued", (_, message) => priorities.push(message.priority))

        for (const priority of ["high", "auto", "low"] as const) {
            await (await fetch(server.url("/text"), { session, priority })).text()
        }
        expect(priorities).toEqual([
            Soup.MessagePriority.HIGH,
            Soup.MessagePriority.NORMAL,
            Soup.MessagePriority.LOW,
        ])
    })

    it("sends the headers of the cache mode", async () => {
        const echo = async (init: RequestInit) =>
            (await (await fetch(server.url("/echo"), init)).json<Echo>()).headers

        const noStore = await echo({ cache: "no-store" })
        expect(noStore["cache-control"]).toBe("no-cache")
        expect(noStore.pragma).toBe("no-cache")
        expect((await echo({ cache: "reload" }))["cache-control"]).toBe("no-cache")
        expect((await echo({ cache: "no-cache" }))["cache-control"]).toBe("max-age=0")
        expect((await echo({}))["cache-control"]).toBeFalsy()

        const custom = await echo({
            cache: "no-cache",
            headers: { "Cache-Control": "no-transform" },
        })
        expect(custom["cache-control"]).toBe("no-transform")
    })

    it("skips the Soup.Cache of the session for no-store and reload", async () => {
        const dir = GLib.dir_make_tmp("gnim-cache-XXXXXX")
        const session = new Soup.Session()
        const cache = Soup.Cache.new(dir, Soup.CacheType.SINGLE_USER)
        session.add_feature(cache)
        const get = async (cache: RequestCache) =>
            (await fetch(server.url("/cached"), { session, cache })).text()

        const first = await get("default")
        // the response is stored in the background after its body was read
        cache.flush()
        expect(await get("default")).toBe(first)
        expect(await get("no-store")).not.toBe(first)
        expect(await get("reload")).not.toBe(first)

        cache.clear()
        expect(GLib.rmdir(dir)).toBe(0)
    })

    it("clones the response body", async () => {
        const response = await fetch(server.url("/stream"))
        const clone = response.clone()
        const [a, b] = await Promise.all([response.text(), clone.text()])
        expect(a).toBe("one two three")
        expect(b).toBe("one two three")
    })
})

const MIB = 1024 * 1024

interface Digest {
    length: number
    sha256: string
    contentLength: string | null
    chunked: boolean
}

function tempFile(bytes: Uint8Array): Gio.File {
    const [file, stream] = Gio.File.new_tmp("gnim-XXXXXX.bin")
    stream.close(null)
    file.replace_contents(bytes, null, false, Gio.FileCreateFlags.NONE, null)
    return file
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

async function digest(body: RequestInit["body"]): Promise<Digest> {
    const response = await fetch(server.url("/digest"), { method: "POST", body })
    return response.json<Digest>()
}

describe("fetch with large bodies", () => {
    const size = 4 * MIB
    const data = pattern(size)

    it("uploads a body produced in JS", async () => {
        async function* chunks() {
            for (let i = 0; i < size; i += 64 * 1024) yield data.subarray(i, i + 64 * 1024)
        }
        const result = await digest(chunks())
        expect(result.length).toBe(size)
        expect(result.sha256).toBe(sha256(data))
        expect(result.chunked).toBe(true)
    })

    it("uploads a file from disk with its length", async () => {
        const file = tempFile(data)
        const result = await digest(file)
        file.delete(null)

        expect(result.length).toBe(size)
        expect(result.sha256).toBe(sha256(data))
        expect(result.contentLength).toBe(String(size))
    })

    it("uploads a blob of memory and a file with its length", async () => {
        const file = tempFile(data)
        const result = await digest(new Blob(["<", file, ">"]))
        file.delete(null)

        const expected = concat([
            new TextEncoder().encode("<"),
            data,
            new TextEncoder().encode(">"),
        ])
        expect(result.length).toBe(size + 2)
        expect(result.sha256).toBe(sha256(expected))
        expect(result.contentLength).toBe(String(size + 2))
    })

    it("downloads in chunks", async () => {
        const response = await fetch(server.url(`/large?size=${size}`))
        const chunks: Uint8Array[] = []
        for await (const chunk of response.chunks()) chunks.push(chunk)

        expect(chunks.length).toBeGreaterThan(1)
        const bytes = concat(chunks)
        expect(bytes.byteLength).toBe(size)
        expect(sha256(bytes)).toBe(sha256(data))
    })

    it("downloads with bytes", async () => {
        const bytes = await (await fetch(server.url(`/large?size=${size}`))).bytes()
        expect(bytes.byteLength).toBe(size)
        expect(sha256(bytes)).toBe(sha256(data))
    })
})

describe("fetch failing mid-transfer", () => {
    it("fails reading a response that is cut off", async () => {
        const response = await fetch(server.url("/truncate"))
        expect(response.status).toBe(200)

        const received: string[] = []
        const read = async () => {
            for await (const chunk of response.chunks()) {
                received.push(new TextDecoder().decode(chunk))
            }
        }
        const error = await read().catch((e: unknown) => e)
        expect(error).toBeInstanceOf(GLib.Error)
        expect(received.join("")).toBe("partial")
    })

    it("fails reading all of a response that is cut off", async () => {
        const response = await fetch(server.url("/truncate"))
        await expect(response.text()).rejects.toBeInstanceOf(GLib.Error)
    })

    it("fails when a file of a FormData shrinks while it is uploaded", async () => {
        const file = tempFile(pattern(MIB))
        const body = new FormData()
        body.append("file", file)

        const sending = fetch(server.url("/digest"), { method: "POST", body })
        file.replace_contents(new Uint8Array(10), null, false, Gio.FileCreateFlags.NONE, null)
        const error = await sending.catch((e: unknown) => e)
        file.delete(null)

        expect(error).toBeInstanceOf(TypeError)
        expect(String((error as TypeError).cause)).toMatch("changed after it was read")
    })

    it("stops a streamed upload when it is cancelled", async () => {
        const signal = new Gio.Cancellable()
        let stopped = false
        async function* chunks() {
            try {
                for (;;) {
                    yield pattern(64 * 1024)
                    await sleep(10)
                }
            } finally {
                stopped = true
            }
        }

        setTimeout(() => signal.cancel(), 100)
        const error = await fetch(server.url("/digest"), {
            method: "POST",
            body: chunks(),
            signal,
        }).catch((e: unknown) => e)

        expect(isCancelled(error)).toBe(true)
        await sleep(50)
        expect(stopped).toBe(true)
    })
})

describe("fetch over HTTPS", () => {
    const certificate = Gio.TlsCertificate.new_from_files(certFile.get_path()!, keyFile.get_path()!)
    const tls = startServer({ tls: certificate })
    const session = new Soup.Session({
        tlsDatabase: Gio.TlsFileDatabase.new(certFile.get_path()!),
    })

    afterAll(() => tls.stop())

    it("fetches with a session that trusts the certificate", async () => {
        expect(tls.url("/text")).toMatch(/^https:/)
        const response = await fetch(tls.url("/text"), { session })
        expect(await response.text()).toBe("hello")

        const echo = await (
            await fetch(tls.url("/echo"), { method: "POST", body: "secure", session })
        ).json<Echo>()
        expect(echo.body).toBe("secure")
    })

    it("streams large bodies", async () => {
        const data = pattern(2 * MIB)
        async function* chunks() {
            for (let i = 0; i < data.byteLength; i += 64 * 1024) {
                yield data.subarray(i, i + 64 * 1024)
            }
        }
        const response = await fetch(tls.url("/digest"), {
            method: "POST",
            body: chunks(),
            session,
        })
        expect((await response.json<Digest>()).sha256).toBe(sha256(data))

        const download = await fetch(tls.url(`/large?size=${data.byteLength}`), { session })
        expect(sha256(await download.bytes())).toBe(sha256(data))
    })

    it("rejects a certificate that is not trusted", async () => {
        const error = await fetch(tls.url("/text")).catch((e: unknown) => e)
        expect(error).toBeInstanceOf(TypeError)
        expect((error as TypeError).cause).toBeInstanceOf(GLib.Error)
    })
})

describe("fetch with compressed responses", () => {
    it("decodes gzip, keeping the headers of the encoded body", async () => {
        const size = 256 * 1024
        const response = await fetch(server.url(`/gzip?size=${size}`))
        expect(response.headers.get("content-encoding")).toBe("gzip")
        expect(Number(response.headers.get("content-length"))).toBeLessThan(size)

        const chunks: Uint8Array[] = []
        for await (const chunk of response.chunks()) chunks.push(chunk)
        const bytes = concat(chunks)
        expect(bytes.byteLength).toBe(size)
        expect(sha256(bytes)).toBe(sha256(pattern(size)))
    })
})

describe("fetch with cookies", () => {
    it("keeps each Set-Cookie header", async () => {
        const response = await fetch(server.url("/cookies/many"))
        expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"])
        await response.text()
    })

    it("does not store cookies with credentials: omit", async () => {
        const session = new Soup.Session()
        const jar = new Soup.CookieJar()
        session.add_feature(jar)

        await (await fetch(server.url("/cookie/set"), { session, credentials: "omit" })).text()
        expect(jar.all_cookies().length).toBe(0)

        await (await fetch(server.url("/cookie/set"), { session })).text()
        expect(jar.all_cookies().length).toBe(1)
    })
})

describe("fetch with many requests at once", () => {
    it("completes more requests than connections per host", async () => {
        const size = 256 * 1024
        // a body holds its connection until it is read, so each request reads its own
        const digests = await Promise.all(
            Array.from({ length: 20 }, async () => {
                const response = await fetch(server.url(`/large?size=${size}`))
                return sha256(await response.bytes())
            }),
        )
        expect(new Set(digests)).toEqual(new Set([sha256(pattern(size))]))
    })

    it("streams many uploads at once", async () => {
        const data = pattern(128 * 1024)
        async function* chunks() {
            for (let i = 0; i < data.byteLength; i += 16 * 1024) {
                yield data.subarray(i, i + 16 * 1024)
                await sleep(1)
            }
        }
        const results = await Promise.all(Array.from({ length: 20 }, () => digest(chunks())))
        for (const result of results) expect(result.sha256).toBe(sha256(data))
    })
})

describe("fetch with other URL schemes", () => {
    it("rejects schemes other than http and https", async () => {
        for (const url of [
            "data:text/plain,hi",
            "file:///etc/hostname",
            "about:blank",
            "ftp://x/",
        ]) {
            await expect(fetch(url)).rejects.toThrow("is not supported")
        }
    })

    it("rejects a redirect it follows to another scheme", async () => {
        const url = server.url(`/redirect-to?code=307&to=${encodeURIComponent("data:,x")}`)
        await expect(fetch(url, { method: "POST", body: "x" })).rejects.toThrow(TypeError)
    })
})

describe("fetch over a unix socket", () => {
    const path = `${GLib.get_tmp_dir()}/gnim-web-${GLib.uuid_string_random()}.sock`
    const unix = startServer({ unix: path })
    const session = new Soup.Session({ remoteConnectable: Gio.UnixSocketAddress.new(path) })

    afterAll(() => unix.stop())

    it("sends requests through the session", async () => {
        expect(await (await fetch(unix.url("/text"), { session })).text()).toBe("hello")

        async function* chunks() {
            yield "over "
            yield "unix"
        }
        const echo = await (
            await fetch(unix.url("/echo"), { method: "POST", body: chunks(), session })
        ).json<Echo>()
        expect(echo.body).toBe("over unix")
    })
})

describe("fetch read as other types", () => {
    it("parses multipart/form-data responses", async () => {
        const form = await (await fetch(server.url("/multipart"))).formData()
        expect(form.get("a")).toBe("1")
        const file = form.get("file") as File
        expect(file).toBeInstanceOf(File)
        expect(file.name).toBe("a.txt")
        expect(file.type).toBe("text/plain")
        expect(await file.text()).toBe("contents")
    })

    it("parses application/x-www-form-urlencoded responses", async () => {
        const form = await (await fetch(server.url("/urlencoded"))).formData()
        expect(form.get("a")).toBe("1")
        expect(form.get("b")).toBe("x y")
    })

    it("rejects formData of other types", async () => {
        await expect((await fetch(server.url("/text"))).formData()).rejects.toThrow(TypeError)
    })

    it("reads blobs typed by content-type", async () => {
        const blob = await (await fetch(server.url("/text"))).blob()
        expect(blob.type).toBe("text/plain")
        expect(await blob.text()).toBe("hello")
    })

    it("reads array buffers", async () => {
        const size = 100 * 1024
        const buffer = await (await fetch(server.url(`/large?size=${size}`))).arrayBuffer()
        expect(buffer.byteLength).toBe(size)
        expect(sha256(new Uint8Array(buffer))).toBe(sha256(pattern(size)))
    })

    it("rejects json of invalid JSON", async () => {
        await expect((await fetch(server.url("/text"))).json()).rejects.toThrow(SyntaxError)
    })
})

describe("file descriptors", () => {
    function openFds(): number {
        const dir = GLib.Dir.open("/proc/self/fd", 0)
        let count = 0
        while (dir.read_name() !== null) count++
        dir.close()
        return count
    }

    /** Lets closed connections and collected streams release their file descriptors. */
    async function settle() {
        System.gc()
        await sleep(200)
        System.gc()
    }

    it("are not leaked by bodies produced in JS", async () => {
        async function* chunks() {
            yield "x".repeat(1000)
        }
        async function* endless() {
            for (;;) {
                yield pattern(64 * 1024)
                await sleep(1)
            }
        }
        async function* failing() {
            yield "x"
            throw new Error("boom")
        }

        await settle()
        const before = openFds()
        for (let i = 0; i < 50; i++) {
            await new Response(chunks()).text()
            for await (const chunk of new Response(endless()).chunks()) {
                expect(chunk.byteLength).toBeGreaterThan(0)
                break
            }
            await new Response(failing()).text().catch(() => null)

            const stream = new Response(endless()).gstream!
            stream.close(null)
        }
        await settle()
        expect(openFds()).toBe(before)
    })

    it("are not leaked by fetch once its connections are closed", async () => {
        const session = new Soup.Session()
        async function* chunks() {
            yield "x".repeat(1000)
        }
        async function* failing() {
            yield "x"
            throw new Error("boom")
        }

        await settle()
        const before = openFds()
        for (let i = 0; i < 30; i++) {
            await (
                await fetch(server.url("/digest"), { method: "POST", body: chunks(), session })
            ).text()
            await fetch(server.url("/echo"), { method: "POST", body: failing(), session }).catch(
                () => null,
            )
            const signal = new Gio.Cancellable()
            const response = await fetch(server.url("/stream"), { session, signal })
            signal.cancel()
            await response.text().catch(() => null)
        }

        session.abort()
        await settle()
        expect(openFds()).toBe(before)
    })
})
