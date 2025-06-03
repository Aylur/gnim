import GLib from "gi://GLib"
import Gio from "gi://Gio"
import Soup from "gi://Soup?version=3.0"

type ResponseType = "basic" | "cors" | "default" | "error" | "opaque" | "opaqueredirect"
export type HeadersInit = Headers | Record<string, string> | [string, string][]
export type ResponseInit = {
    headers?: HeadersInit
    status?: number
    statusText?: string
}
export type RequestInit = {
    body?: string
    headers?: HeadersInit
    method?: string
}

export class Headers {
    private headers: Map<string, string[]> = new Map()

    constructor(init: HeadersInit = {}) {
        if (Array.isArray(init)) {
            for (const [name, value] of init) {
                this.append(name, value)
            }
        } else if (init instanceof Headers) {
            init.forEach((value, name) => this.set(name, value))
        } else if (typeof init === "object") {
            for (const name in init) {
                this.set(name, init[name])
            }
        }
    }

    append(name: string, value: string): void {
        name = name.toLowerCase()
        if (!this.headers.has(name)) {
            this.headers.set(name, [])
        }
        this.headers.get(name)!.push(value)
    }

    delete(name: string): void {
        this.headers.delete(name.toLowerCase())
    }

    get(name: string): string | null {
        const values = this.headers.get(name.toLowerCase())
        return values ? values.join(", ") : null
    }

    getAll(name: string): string[] {
        return this.headers.get(name.toLowerCase()) || []
    }

    has(name: string): boolean {
        return this.headers.has(name.toLowerCase())
    }

    set(name: string, value: string): void {
        this.headers.set(name.toLowerCase(), [value])
    }

    forEach(
        callbackfn: (value: string, name: string, parent: Headers) => void,
        thisArg?: any,
    ): void {
        for (const [name, values] of this.headers.entries()) {
            callbackfn.call(thisArg, values.join(", "), name, this)
        }
    }

    *entries(): IterableIterator<[string, string]> {
        for (const [name, values] of this.headers.entries()) {
            yield [name, values.join(", ")]
        }
    }

    *keys(): IterableIterator<string> {
        for (const name of this.headers.keys()) {
            yield name
        }
    }

    *values(): IterableIterator<string> {
        for (const values of this.headers.values()) {
            yield values.join(", ")
        }
    }

    [Symbol.iterator](): IterableIterator<[string, string]> {
        return this.entries()
    }
}

export class URLSearchParams {
    private params = new Map<string, Array<string>>()

    constructor(init: string[][] | Record<string, string> | string | URLSearchParams = "") {
        if (typeof init === "string") {
            this.parseString(init)
        } else if (Array.isArray(init)) {
            for (const [key, value] of init) {
                this.append(key, value)
            }
        } else if (init instanceof URLSearchParams) {
            init.forEach((value, key) => this.append(key, value))
        } else if (typeof init === "object") {
            for (const key in init) {
                this.set(key, init[key])
            }
        }
    }

    private parseString(query: string) {
        query
            .replace(/^\?/, "")
            .split("&")
            .forEach((pair) => {
                if (!pair) return
                const [key, value] = pair.split("=").map(decodeURIComponent)
                this.append(key, value ?? "")
            })
    }

    get size() {
        return this.params.size
    }

    append(name: string, value: string): void {
        if (!this.params.has(name)) {
            this.params.set(name, [])
        }
        this.params.get(name)!.push(value)
    }

    delete(name: string, value?: string): void {
        if (value === undefined) {
            this.params.delete(name)
        } else {
            const values = this.params.get(name) || []
            this.params.set(
                name,
                values.filter((v) => v !== value),
            )
            if (this.params.get(name)!.length === 0) {
                this.params.delete(name)
            }
        }
    }

    get(name: string): string | null {
        const values = this.params.get(name)
        return values ? values[0] : null
    }

    getAll(name: string): Array<string> {
        return this.params.get(name) || []
    }

    has(name: string, value?: string): boolean {
        if (!this.params.has(name)) return false
        if (value === undefined) return true
        return this.params.get(name)?.includes(value) || false
    }

    set(name: string, value: string): void {
        this.params.set(name, [value])
    }

    sort(): void {
        this.params = new Map([...this.params.entries()].sort())
    }

    toString(): string {
        return [...this.params.entries()]
            .flatMap(([key, values]) =>
                values.map((value) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`),
            )
            .join("&")
    }

    forEach(
        callbackfn: (value: string, key: string, parent: URLSearchParams) => void,
        thisArg?: any,
    ): void {
        for (const [key, values] of this.params.entries()) {
            for (const value of values) {
                callbackfn.call(thisArg, value, key, this)
            }
        }
    }

    [Symbol.iterator](): MapIterator<[string, Array<string>]> {
        return this.params.entries()
    }
}

// TODO: impl setters
export class URL {
    readonly uri: GLib.Uri

    readonly searchParams: URLSearchParams

    constructor(url: string | URL, base?: string | URL) {
        if (base) {
            url = GLib.Uri.resolve_relative(
                base instanceof URL ? base.toString() : base,
                url instanceof URL ? url.toString() : url,
                GLib.UriFlags.HAS_PASSWORD,
            )
        }
        this.uri = GLib.Uri.parse(
            url instanceof URL ? url.toString() : url,
            GLib.UriFlags.HAS_PASSWORD,
        )
        this.searchParams = new URLSearchParams(this.uri.get_query() ?? "")
    }

    get href(): string {
        const uri = GLib.Uri.build_with_user(
            GLib.UriFlags.HAS_PASSWORD,
            this.uri.get_scheme(),
            this.uri.get_user(),
            this.uri.get_password(),
            null,
            this.uri.get_host(),
            this.uri.get_port(),
            this.uri.get_path(),
            this.searchParams.toString(),
            this.uri.get_fragment(),
        )

        return uri.to_string()
    }

    get origin(): string {
        return "null" // TODO:
    }

    get protocol(): string {
        return this.uri.get_scheme() + ":"
    }

    get username(): string {
        return this.uri.get_user() ?? ""
    }

    get password(): string {
        return this.uri.get_password() ?? ""
    }

    get host(): string {
        const host = this.hostname
        const port = this.port
        return host ? host + (port ? ":" + port : "") : ""
    }

    get hostname(): string {
        return this.uri.get_host() ?? ""
    }

    get port(): string {
        const p = this.uri.get_port()
        return p >= 0 ? p.toString() : ""
    }

    get pathname(): string {
        return this.uri.get_path()
    }

    get hash(): string {
        const frag = this.uri.get_fragment()
        return frag ? "#" + frag : ""
    }

    get search(): string {
        const q = this.searchParams.toString()
        return q ? "?" + q : ""
    }

    toString(): string {
        return this.href
    }

    toJSON(): string {
        return this.href
    }
}

export class Response {
    readonly body: Gio.InputStream | null = null
    readonly bodyUsed: boolean = false

    readonly headers: Headers
    readonly ok: boolean
    readonly redirected: boolean = false
    readonly status: number
    readonly statusText: string
    readonly type: ResponseType = "default"
    readonly url: string = ""

    static error(): Response {
        throw Error("Not yet implemented")
    }

    static json(_data: any, _init?: ResponseInit): Response {
        throw Error("Not yet implemented")
    }

    static redirect(_url: string | URL, _status?: number): Response {
        throw Error("Not yet implemented")
    }

    constructor(body: Gio.InputStream | null = null, options: ResponseInit = {}) {
        this.body = body
        this.headers = new Headers(options.headers ?? {})
        this.status = options.status ?? 200
        this.statusText = options.statusText ?? ""
        this.ok = this.status >= 200 && this.status < 300
    }

    async blob(): Promise<never> {
        throw Error("Not implemented")
    }

    async bytes() {
        const { CLOSE_SOURCE, CLOSE_TARGET } = Gio.OutputStreamSpliceFlags
        const outputStream = Gio.MemoryOutputStream.new_resizable()
        if (!this.body) return null

        await new Promise((resolve, reject) => {
            outputStream.splice_async(
                this.body!,
                CLOSE_TARGET | CLOSE_SOURCE,
                GLib.PRIORITY_DEFAULT,
                null,
                (_, res) => {
                    try {
                        resolve(outputStream.splice_finish(res))
                    } catch (error) {
                        reject(error)
                    }
                },
            )
        })

        Object.assign(this, { bodyUsed: true })
        return outputStream.steal_as_bytes()
    }

    async formData(): Promise<never> {
        throw Error("Not yet implemented")
    }

    async arrayBuffer() {
        const blob = await this.bytes()
        if (!blob) return null

        return blob.toArray().buffer
    }

    async text() {
        const blob = await this.bytes()
        return blob ? new TextDecoder().decode(blob.toArray()) : ""
    }

    async json() {
        const text = await this.text()
        return JSON.parse(text)
    }

    clone(): Response {
        throw Error("Not yet implemented")
    }
}

export async function fetch(url: string | URL, { method, headers, body }: RequestInit = {}) {
    const session = new Soup.Session()

    const message = new Soup.Message({
        method: method || "GET",
        uri: url instanceof URL ? url.uri : GLib.Uri.parse(url, GLib.UriFlags.NONE),
    })

    if (headers) {
        for (const [key, value] of Object.entries(headers))
            message.get_request_headers().append(key, String(value))
    }

    if (typeof body === "string") {
        message.set_request_body_from_bytes(null, new GLib.Bytes(new TextEncoder().encode(body)))
    }

    const inputStream: Gio.InputStream = await new Promise((resolve, reject) => {
        session.send_async(message, 0, null, (_, res) => {
            try {
                resolve(session.send_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })

    return new Response(inputStream, {
        statusText: message.reason_phrase,
        status: message.status_code,
    })
}

export default fetch
