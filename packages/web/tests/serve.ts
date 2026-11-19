import { afterAll, describe, expect, it } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import System from "system"
import { Blob } from "../lib/blob.js"
import { fetch } from "../lib/fetch.js"
import { FormData } from "../lib/formdata.js"
import { collect } from "../lib/lib.js"
import type { Request } from "../lib/request.js"
import { Response } from "../lib/response.js"
import { type ServeOptions, type Server, serve } from "../lib/serve.js"
import { URL } from "../lib/url.js"
import certFile from "./cert/cert.pem?file"
import keyFile from "./cert/key.pem?file"
import { pattern, sha256 } from "./server.js"

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

const servers: Server[] = []

afterAll(() => servers.forEach((server) => server.stop()))

/** A server on a free port, stopped after the tests. */
function start(options: Omit<ServeOptions, "port" | "hostname" | "unix">): Server {
    const server = serve(options)
    servers.push(server)
    return server
}

function url(server: Server, path: string): string {
    return new URL(path, server.url!).href
}

describe("serve", () => {
    it("listens on a free port of localhost", async () => {
        const server = start({ fetch: () => new Response("hello") })
        expect(server.url?.hostname).toBe("localhost")
        expect(server.url?.port).not.toBe("0")

        const response = await fetch(server.url!)
        expect(response.status).toBe(200)
        expect(response.headers.get("content-type")).toBe("text/plain;charset=UTF-8")
        expect(response.headers.get("content-length")).toBe("5")
        expect(await response.text()).toBe("hello")
    })

    it("passes the method, URL and headers of the request", async () => {
        let received: Request | null = null
        let address: Gio.SocketAddress | null = null
        const server = start({
            fetch(request, server) {
                received = request
                address = server.remoteAddress(request)
                return new Response(null, { status: 204 })
            },
        })

        await fetch(url(server, "/path?a=1"), { method: "DELETE", headers: { "X-Test": "1" } })
        const request = received! as Request
        expect(request.method).toBe("DELETE")
        expect(new URL(request.url).pathname).toBe("/path")
        expect(new URL(request.url).search).toBe("?a=1")
        expect(request.headers.get("x-test")).toBe("1")
        expect(request.gstream).toBe(null)
        expect(address).toBeInstanceOf(Gio.InetSocketAddress)
    })

    it("keeps percent-encoded delimiters in the path of the request URL", async () => {
        let received: Request | null = null
        const server = start({
            fetch(request) {
                received = request
                return new Response(null, { status: 204 })
            },
        })

        await fetch(url(server, "/a%2Fb%3Fc%23d%25e?q=%26%23"))
        const { pathname, search } = new URL((received! as Request).url)
        expect(pathname).toBe("/a%2Fb%3Fc%23d%25e")
        expect(search).toBe("?q=%26%23")
    })

    it("sends the status, status text and headers of the response", async () => {
        const server = start({
            fetch: () =>
                new Response("created", {
                    status: 201,
                    statusText: "Made",
                    headers: [
                        ["X-Test", "1"],
                        ["Set-Cookie", "a=1"],
                        ["Set-Cookie", "b=2"],
                    ],
                }),
        })

        const response = await fetch(server.url!)
        expect(response.status).toBe(201)
        expect(response.statusText).toBe("Made")
        expect(response.headers.get("x-test")).toBe("1")
        expect(response.headers.getSetCookie()).toEqual(["a=1", "b=2"])
        expect(await response.text()).toBe("created")
    })

    it("reads the request body as text, JSON and form data", async () => {
        const server = start({
            async fetch(request) {
                const { pathname } = new URL(request.url)
                if (pathname === "/json") return Response.json(await request.json())
                if (pathname === "/form") {
                    const form = await request.formData()
                    const file = form.get("file") as Blob
                    return Response.json({ name: form.get("name"), file: await file.text() })
                }
                return new Response(await request.text())
            },
        })

        const text = await fetch(url(server, "/text"), { method: "POST", body: "text" })
        expect(await text.text()).toBe("text")

        const json = await fetch(url(server, "/json"), {
            method: "POST",
            body: JSON.stringify({ a: [1, 2] }),
        })
        expect(await json.json()).toEqual({ a: [1, 2] })

        const form = new FormData()
        form.append("name", "value")
        form.append("file", new Blob(["contents"]), "a.txt")
        const multipart = await fetch(url(server, "/form"), { method: "POST", body: form })
        expect(await multipart.json()).toEqual({ name: "value", file: "contents" })
    })

    it("streams a request body back as the response", async () => {
        const server = start({ fetch: (request) => new Response(request.gstream) })
        const data = pattern(4 * 1024 * 1024)

        async function* upload() {
            for (let i = 0; i < data.byteLength; i += 100_000) yield data.subarray(i, i + 100_000)
        }

        const response = await fetch(server.url!, { method: "POST", body: upload() })
        expect(response.headers.get("transfer-encoding")).toBe("chunked")
        expect(sha256(await response.bytes())).toBe(sha256(data))
    })

    it("streams a response while it is produced", async () => {
        let produced = 0
        const server = start({
            fetch: () =>
                new Response(
                    (async function* () {
                        for (const chunk of ["one ", "two ", "three"]) {
                            produced++
                            yield chunk
                            await sleep(50)
                        }
                    })(),
                ),
        })

        const response = await fetch(server.url!)
        const chunks = response.chunks()
        const first = await chunks.next()
        expect(new TextDecoder().decode(first.value!)).toBe("one ")
        expect(produced).toBe(1)

        const rest = await collect({ [Symbol.asyncIterator]: () => chunks })
        expect(new TextDecoder().decode(rest)).toBe("two three")
    })

    it("sends the length of blobs and files", async () => {
        const file = Gio.File.new_for_path(certFile.get_path()!)
        const server = start({
            fetch: (request) =>
                new URL(request.url).pathname === "/file"
                    ? new Response(file)
                    : new Response(new Blob(["blob"], { type: "text/x-test" })),
        })

        const blob = await fetch(url(server, "/blob"))
        expect(blob.headers.get("content-length")).toBe("4")
        expect(blob.headers.get("content-type")).toBe("text/x-test")
        expect(await blob.text()).toBe("blob")

        const [, contents] = file.load_contents(null)
        const sent = await fetch(url(server, "/file"))
        expect(sent.headers.get("content-length")).toBe(String(contents.byteLength))
        expect(await sent.bytes()).toEqual(contents)
    })

    it("sends no body for HEAD requests and 204 responses", async () => {
        let read = false
        const server = start({
            fetch: (request) =>
                new URL(request.url).pathname === "/empty"
                    ? new Response(null, { status: 204 })
                    : new Response(
                          (async function* () {
                              read = true
                              yield "body"
                          })(),
                      ),
        })

        const head = await fetch(server.url!, { method: "HEAD" })
        expect(head.status).toBe(200)
        expect(head.gstream).toBe(null)
        expect(read).toBe(false)

        const empty = await fetch(url(server, "/empty"))
        expect(empty.status).toBe(204)
        expect(await empty.text()).toBe("")
    })

    it("answers with 500 when fetch throws", async () => {
        const server = start({
            fetch() {
                throw new Error("expected test error")
            },
            error: () => new Response(null, { status: 500 }),
        })

        const response = await fetch(server.url!)
        expect(response.status).toBe(500)
    })

    it("answers with the response of error", async () => {
        const errors: unknown[] = []
        const server = start({
            fetch: () => Promise.reject(new Error("failed")),
            error(error) {
                errors.push(error)
                return new Response("handled", { status: 503 })
            },
        })

        const response = await fetch(server.url!)
        expect(response.status).toBe(503)
        expect(await response.text()).toBe("handled")
        expect(errors).toEqual([new Error("failed")])
    })

    it("treats a network error or a value other than a Response as an error", async () => {
        const errors: unknown[] = []
        const server = start({
            fetch: (request) =>
                new URL(request.url).pathname === "/error"
                    ? Response.error()
                    : ("text" as unknown as Response),
            error(error) {
                errors.push(error)
                return new Response(null, { status: 500 })
            },
        })

        expect((await fetch(url(server, "/error"))).status).toBe(500)
        expect((await fetch(url(server, "/text"))).status).toBe(500)
        expect(errors.map((error) => (error as Error).message)).toEqual([
            "serve: fetch returned a network error",
            "serve: fetch did not return a Response",
        ])
    })

    it("responds without reading the request body", async () => {
        const server = start({ fetch: () => new Response("ignored") })
        const response = await fetch(server.url!, {
            method: "POST",
            body: pattern(3 * 1024 * 1024),
        })
        expect(await response.text()).toBe("ignored")

        // the connection can still be used
        expect(await (await fetch(server.url!)).text()).toBe("ignored")
    })

    it("receives a large request body while the handler reads it slowly", async () => {
        const data = pattern(4 * 1024 * 1024)
        const server = start({
            async fetch(request) {
                const chunks: Uint8Array[] = []
                for await (const chunk of request.chunks()) {
                    chunks.push(chunk)
                    if (chunks.length % 16 === 0) await sleep(5)
                }
                return new Response(sha256(await new Blob(chunks).bytes()))
            },
        })

        const response = await fetch(server.url!, { method: "POST", body: new Blob([data]) })
        expect(await response.text()).toBe(sha256(data))
    })

    it("cuts off the response when producing its body fails", async () => {
        const server = start({
            fetch: () =>
                new Response(
                    (async function* () {
                        yield "partial"
                        await sleep(20)
                        throw new Error("expected test error")
                    })(),
                ),
            error: () => new Response(null, { status: 500 }),
        })

        const origLog = globalThis.logError
        globalThis.logError = () => {}
        try {
            const response = await fetch(server.url!)
            expect(response.status).toBe(200)
            await expect(response.text()).rejects.toThrow()
        } finally {
            globalThis.logError = origLog
        }
    })

    it("cancels the signal of a request when the client disconnects", async () => {
        let cancelled = () => {}
        const disconnected = new Promise<void>((resolve) => (cancelled = resolve))
        const server = start({
            fetch(request) {
                request.signal?.connect(() => cancelled())
                return new Promise(() => {})
            },
        })

        const signal = new Gio.Cancellable()
        const response = fetch(server.url!, { signal })
        await sleep(100)
        signal.cancel()
        await expect(response).rejects.toThrow()
        await disconnected
    })

    it("stops producing the response when the client disconnects", async () => {
        let stopped = () => {}
        const finished = new Promise<void>((resolve) => (stopped = resolve))
        const server = start({
            fetch: () =>
                new Response(
                    (async function* () {
                        try {
                            for (;;) {
                                yield pattern(64 * 1024)
                                await sleep(5)
                            }
                        } finally {
                            stopped()
                        }
                    })(),
                ),
        })

        const signal = new Gio.Cancellable()
        const response = await fetch(server.url!, { signal })
        await response.chunks().next()
        signal.cancel()
        await finished
    })

    it("does not cancel the signal after responding", async () => {
        let signal: Gio.Cancellable | null = null
        const server = start({
            fetch(request) {
                signal = request.signal
                return new Response("done")
            },
        })

        const session = new Soup.Session()
        expect(await (await fetch(server.url!, { session })).text()).toBe("done")
        session.abort()
        await sleep(100)
        expect((signal! as Gio.Cancellable).is_cancelled()).toBe(false)
    })

    it("stops when its cancellable is cancelled", async () => {
        const cancellable = new Gio.Cancellable()
        const server = start({ cancellable, fetch: () => new Response("up") })
        expect(await (await fetch(server.url!)).text()).toBe("up")

        cancellable.cancel()
        await expect(fetch(server.url!)).rejects.toThrow("fetch failed")
    })

    it("keeps listening when nothing references it", async () => {
        const server = new WeakRef(serve({ fetch: () => new Response("alive") }))
        const url = server.deref()!.url!
        // a WeakRef keeps its target alive until the current job ends
        await sleep(0)
        System.gc()

        try {
            expect(await (await fetch(url)).text()).toBe("alive")
        } finally {
            server.deref()?.stop()
        }
    })

    it("listens on an IP address", async () => {
        const server = serve({ hostname: "127.0.0.1", fetch: () => new Response("ip") })
        servers.push(server)
        expect(server.url?.hostname).toBe("127.0.0.1")
        expect(await (await fetch(server.url!)).text()).toBe("ip")
    })

    it("rejects a hostname that is not an IP address", () => {
        expect(() => serve({ hostname: "example.com", fetch: () => new Response() })).toThrow(
            'serve: hostname must be "localhost" or an IP address, not "example.com"',
        )
    })
})

describe("serve over a unix socket", () => {
    it("serves requests and removes the socket when stopped", async () => {
        const path = GLib.build_filenamev([
            GLib.get_user_runtime_dir(),
            `gnim-serve-${GLib.uuid_string_random()}.sock`,
        ])
        const server = serve({
            unix: path,
            fetch: async (request, server) =>
                Response.json({
                    body: await request.text(),
                    unix: server.remoteAddress(request) instanceof Gio.UnixSocketAddress,
                }),
        })
        expect(server.url).toBe(null)

        try {
            const session = new Soup.Session({
                remoteConnectable: Gio.UnixSocketAddress.new(path),
            })
            const response = await fetch("http://localhost/", {
                method: "POST",
                body: "over unix",
                session,
            })
            expect(await response.json()).toEqual({ body: "over unix", unix: true })
        } finally {
            server.stop()
        }
        expect(GLib.file_test(path, GLib.FileTest.EXISTS)).toBe(false)
    })
})

describe("serve over HTTPS", () => {
    const session = new Soup.Session({
        tlsDatabase: Gio.TlsFileDatabase.new(certFile.get_path()!),
    })

    it("serves with a certificate and key as files", async () => {
        const server = start({
            tls: { cert: certFile, key: keyFile },
            fetch: () => new Response("secure"),
        })
        expect(server.url?.protocol).toBe("https:")

        const response = await fetch(server.url!, { session })
        expect(await response.text()).toBe("secure")
    })

    it("serves with a certificate and key as PEM", async () => {
        const [, cert] = certFile.load_contents(null)
        const [, key] = keyFile.load_contents(null)
        const decoder = new TextDecoder()
        const server = start({
            tls: { cert: decoder.decode(cert), key: decoder.decode(key) },
            fetch: (request) => new Response(request.gstream),
        })

        const data = pattern(1024 * 1024)
        const response = await fetch(server.url!, { method: "POST", body: data, session })
        expect(sha256(await response.bytes())).toBe(sha256(data))
    })
})
