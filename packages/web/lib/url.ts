import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { decoder, encoder } from "./lib.js"

type URLSearchParamsInit =
    string | URLSearchParams | Iterable<readonly [string, string]> | Record<string, string>

function isUnreserved(byte: number): boolean {
    return (
        (byte >= 0x30 && byte <= 0x39) || // 0-9
        (byte >= 0x41 && byte <= 0x5a) || // A-Z
        (byte >= 0x61 && byte <= 0x7a) || // a-z
        byte === 0x2a || // *
        byte === 0x2d || // -
        byte === 0x2e || // .
        byte === 0x5f // _
    )
}

/** application/x-www-form-urlencoded serializer for a single name or value */
function formEncode(str: string): string {
    let out = ""
    for (const byte of encoder.encode(str)) {
        if (byte === 0x20) {
            out += "+"
        } else if (isUnreserved(byte)) {
            out += String.fromCharCode(byte)
        } else {
            out += "%" + byte.toString(16).toUpperCase().padStart(2, "0")
        }
    }
    return out
}

/**
 * Percent-decodes a string, leaving invalid escape sequences as they are
 * and replacing invalid UTF-8 with U+FFFD instead of throwing like `decodeURIComponent` does.
 */
function percentDecode(str: string): string {
    return str.replace(/(?:%[\dA-Fa-f]{2})+/g, (run) =>
        decoder.decode(Uint8Array.from(run.slice(1).split("%"), (hex) => parseInt(hex, 16))),
    )
}

function formDecode(str: string): string {
    return percentDecode(str.replaceAll("+", " "))
}

function parseQuery(query: string): Array<[string, string]> {
    const list: Array<[string, string]> = []
    for (const pair of query.split("&")) {
        if (!pair) continue
        const i = pair.indexOf("=")
        const name = i === -1 ? pair : pair.slice(0, i)
        const value = i === -1 ? "" : pair.slice(i + 1)
        list.push([formDecode(name), formDecode(value)])
    }
    return list
}

// module private accessors used by URL to keep the query and the params in sync
let attachSearchParams: (params: URLSearchParams, onUpdate: (query: string) => void) => void
let resetSearchParams: (params: URLSearchParams, query: string) => void

/**
 * Implementation of the [URLSearchParams](https://developer.mozilla.org/docs/Web/API/URLSearchParams) web API.
 */
class URLSearchParams extends GObject.Object {
    declare static readonly $gtype: GObject.GType<URLSearchParams>

    static {
        GObject.registerClass({ GTypeName: "GnimWeb_URLSearchParams" }, this)
    }

    #list: Array<[string, string]> = []
    #onUpdate: ((query: string) => void) | null = null

    static {
        attachSearchParams = (params, onUpdate) => {
            params.#onUpdate = onUpdate
        }
        resetSearchParams = (params, query) => {
            params.#list = parseQuery(query)
        }
    }

    constructor(init: URLSearchParamsInit = "") {
        super()

        if (typeof init === "string") {
            this.#list = parseQuery(init.startsWith("?") ? init.slice(1) : init)
        } else if (init instanceof URLSearchParams) {
            this.#list = init.#list.map(([name, value]) => [name, value])
        } else if (Symbol.iterator in init) {
            for (const pair of init) {
                this.#list.push([String(pair[0]), String(pair[1])])
            }
        } else {
            for (const [name, value] of Object.entries(init)) {
                this.#list.push([name, String(value)])
            }
        }
    }

    #update() {
        this.#onUpdate?.(this.toString())
    }

    /**
     * The number of parameters.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/size)
     */
    get size(): number {
        return this.#list.length
    }

    /**
     * Appends a parameter, keeping the existing ones with the same name.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/append)
     */
    append(name: string, value: string): void {
        this.#list.push([String(name), String(value)])
        this.#update()
    }

    /**
     * Removes the parameters named `name`, only those with `value` when it is given.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/delete)
     */
    delete(name: string, value?: string): void {
        this.#list = this.#list.filter(
            ([n, v]) => n !== name || (typeof value === "string" && v !== value),
        )
        this.#update()
    }

    /**
     * Returns the first value of `name`, or `null` when there is none.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/get)
     */
    get(name: string): string | null {
        return this.#list.find(([n]) => n === name)?.[1] ?? null
    }

    /**
     * Returns all values of `name`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/getAll)
     */
    getAll(name: string): string[] {
        return this.#list.filter(([n]) => n === name).map(([, v]) => v)
    }

    /**
     * Whether there is a parameter named `name`, with `value` when it is given.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/has)
     */
    has(name: string, value?: string): boolean {
        return this.#list.some(([n, v]) => n === name && (typeof value !== "string" || v === value))
    }

    /**
     * Sets the value of `name`, replacing all of its values.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/set)
     */
    set(name: string, value: string): void
    set(...args: never[]): unknown
    set(name: string, value: string): void {
        const i = this.#list.findIndex(([n]) => n === name)
        if (i === -1) {
            this.#list.push([String(name), String(value)])
        } else {
            this.#list[i] = [String(name), String(value)]
            this.#list = this.#list.filter(([n], j) => j <= i || n !== name)
        }
        this.#update()
    }

    /**
     * Sorts the parameters by name, keeping the order of parameters with the same name.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/sort)
     */
    sort(): void {
        // Array.prototype.sort is stable and compares UTF-16 code units, as the spec requires
        this.#list.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        this.#update()
    }

    forEach(
        callbackfn: (value: string, name: string, parent: URLSearchParams) => void,
        thisArg?: unknown,
    ): void {
        for (const [name, value] of this.#list) {
            callbackfn.call(thisArg, value, name, this)
        }
    }

    /**
     * Iterates the name and value of each parameter.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/entries)
     */
    *entries(): IterableIterator<[string, string]> {
        for (const [name, value] of this.#list) yield [name, value]
    }

    /**
     * Iterates the name of each parameter.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/keys)
     */
    *keys(): IterableIterator<string> {
        for (const [name] of this.#list) yield name
    }

    /**
     * Iterates the value of each parameter.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/values)
     */
    *values(): IterableIterator<string> {
        for (const [, value] of this.#list) yield value
    }

    [Symbol.iterator](): IterableIterator<[string, string]> {
        return this.entries()
    }

    /**
     * Serializes the parameters as a query string, without the leading `?`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URLSearchParams/toString)
     */
    toString(): string {
        return this.#list
            .map(([name, value]) => `${formEncode(name)}=${formEncode(value)}`)
            .join("&")
    }

    get [Symbol.toStringTag](): string {
        return "URLSearchParams"
    }
}

const FLAGS = GLib.UriFlags.HAS_PASSWORD | GLib.UriFlags.ENCODED | GLib.UriFlags.SCHEME_NORMALIZE
const JOIN_FLAGS = GLib.UriFlags.HAS_PASSWORD | GLib.UriFlags.ENCODED

const SPECIAL_SCHEMES: Record<string, number> = {
    ftp: 21,
    file: -1,
    http: 80,
    https: 443,
    ws: 80,
    wss: 443,
}

// characters that are left as is when escaping a component in setters
const USERINFO_CHARS = "!$&'()*+,%"
const PATH_CHARS = "!$&'()*+,;=:@/%"
const QUERY_CHARS = "!$&'()*+,;=:@/?%"
const FRAGMENT_CHARS = "!$&'()*+,;=:@/?#%"

const FORBIDDEN_HOST = /[\0\t\n\r #/:<>?@[\\\]^|%]/
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*$/

interface Components {
    scheme: string
    user: string
    password: string
    host: string | null
    port: number
    path: string
    query: string | null
    fragment: string | null
}

function isSpecial(scheme: string): boolean {
    return scheme in SPECIAL_SCHEMES
}

// GLib rejects invalid percent escapes, while browsers keep them as they are
function escapeLonePercent(str: string): string {
    return str.replace(/%(?![0-9A-Fa-f]{2})/g, "%25")
}

function escape(str: string, allowed: string): string {
    return GLib.Uri.escape_string(escapeLonePercent(str), allowed, false)
}

function clean(input: string): string {
    return escapeLonePercent(input.replace(/^[\0-\x20]+|[\0-\x20]+$/g, "").replace(/[\t\n\r]/g, ""))
}

// Browsers are lenient with slashes in special URLs: `http:\\a.com` and
// `http:a.com` both mean `http://a.com`, which GLib does not understand.
function fixSlashes(input: string): string {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(input)
    if (!match) return input

    const scheme = match[1]!.toLowerCase()
    if (!isSpecial(scheme)) return input

    const rest = input.slice(match[0].length)
    const end = rest.search(/[?#]/)
    const head = (end === -1 ? rest : rest.slice(0, end)).replaceAll("\\", "/")
    const tail = end === -1 ? "" : rest.slice(end)

    if (scheme === "file") return `${scheme}:${head}${tail}`
    return `${scheme}://${head.replace(/^\/*/, "")}${tail}`
}

function toAsciiHost(host: string): string {
    if (host.includes(":")) return host.toLowerCase() // IPv6 address
    if (FORBIDDEN_HOST.test(host)) throw new TypeError(`Invalid host: ${host}`)

    const ascii = GLib.hostname_to_ascii(host)
    if (ascii === null) throw new TypeError(`Invalid host: ${host}`)
    return ascii.toLowerCase()
}

function parse(input: string): Components {
    let uri: GLib.Uri

    try {
        uri = GLib.Uri.parse(fixSlashes(clean(input)), FLAGS)
    } catch (error) {
        throw new TypeError(`Invalid URL: ${input}`, { cause: error })
    }

    const scheme = uri.get_scheme().toLowerCase()
    const special = isSpecial(scheme)
    let host = uri.get_host()
    let path = uri.get_path()

    if (special && scheme !== "file" && !host) {
        throw new TypeError(`Invalid URL: ${input}`)
    }

    if (host && special) host = toAsciiHost(host)
    if (special && path === "") path = "/"

    const port = uri.get_port()

    return {
        scheme,
        user: uri.get_user() ?? "",
        password: uri.get_password() ?? "",
        host,
        port: port === SPECIAL_SCHEMES[scheme] ? -1 : port,
        path,
        query: uri.get_query(),
        fragment: uri.get_fragment(),
    }
}

function serialize(c: Components): string {
    const hasCredentials = c.user !== "" || c.password !== ""

    return GLib.Uri.join_with_user(
        JOIN_FLAGS,
        c.scheme,
        hasCredentials ? c.user : null,
        c.password !== "" ? c.password : null,
        null,
        c.host,
        c.port,
        c.path,
        c.query,
        c.fragment,
    )
}

function href(url: string | URL | GLib.Uri): string {
    if (url instanceof URL) return url.href
    if (url instanceof GLib.Uri) return url.to_string()
    return String(url)
}

function resolve(url: string | URL, base: string | URL): string {
    const baseUrl = base instanceof URL ? base : new URL(base)
    const ref = clean(href(url))

    try {
        return GLib.Uri.resolve_relative(baseUrl.href, ref, FLAGS)
    } catch (error) {
        throw new TypeError(`Invalid URL: ${ref}`, { cause: error })
    }
}

/**
 * Implementation of the [URL](https://developer.mozilla.org/docs/Web/API/URL) web API
 * on top of [GLib.Uri](https://docs.gtk.org/glib/struct.Uri.html).
 */
class URL extends GObject.Object {
    declare static readonly $gtype: GObject.GType<URL>

    static {
        GObject.registerClass({ GTypeName: "GnimWeb_URL" }, this)
    }

    #c: Components
    readonly #searchParams: URLSearchParams

    /**
     * Returns `true` when `url` can be parsed relative to `base`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/canParse_static)
     */
    static canParse(url: string | URL, base?: string | URL): boolean {
        return URL.parse(url, ...(base ? [base] : [])) !== null
    }

    /**
     * Like the constructor, but returns `null` instead of throwing on invalid input.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/parse_static)
     */
    static parse(url: string | URL, base?: string | URL): URL | null {
        try {
            return new URL(url, ...(base ? [base] : []))
        } catch {
            return null
        }
    }

    constructor(url: GLib.Uri)
    constructor(url: string | URL, base?: string | URL)
    constructor(url: string | URL | GLib.Uri, base?: string | URL) {
        super()

        this.#c = parse(url instanceof GLib.Uri || !base ? href(url) : resolve(url, base))
        this.#searchParams = new URLSearchParams(this.#c.query ?? "")
        attachSearchParams(this.#searchParams, (query) => {
            this.#c.query = query === "" ? null : query
        })
    }

    #update(patch: Partial<Components>) {
        try {
            this.#c = parse(serialize({ ...this.#c, ...patch }))
        } catch {
            return
        }
    }

    get #hasOpaquePath(): boolean {
        return this.#c.host === null && !this.#c.path.startsWith("/")
    }

    get #cannotHaveCredentials(): boolean {
        return !this.#c.host || this.#c.scheme === "file"
    }

    /**
     * The whole URL. Setting it throws a `TypeError` when the new URL is invalid.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/href)
     */
    get href(): string {
        return serialize(this.#c)
    }

    set href(value: string) {
        this.#c = parse(value)
        resetSearchParams(this.#searchParams, this.#c.query ?? "")
    }

    /**
     * The scheme, host and port, or `"null"` for URLs without an origin.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/origin)
     */
    get origin(): string {
        const { scheme } = this.#c
        if (scheme === "file" || !isSpecial(scheme)) return "null"
        return `${scheme}://${this.host}`
    }

    /**
     * The scheme followed by `:`, such as `"https:"`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/protocol)
     */
    get protocol(): string {
        return `${this.#c.scheme}:`
    }

    set protocol(value: string) {
        const scheme = value.split(":")[0]!.toLowerCase()
        if (!SCHEME.test(scheme)) return
        if (isSpecial(scheme) !== isSpecial(this.#c.scheme)) return

        const { user, password, port } = this.#c
        if (scheme === "file" && (user || password || port !== -1)) return

        this.#update({ scheme })
    }

    /**
     * The username, `""` when there is none.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/username)
     */
    get username(): string {
        return this.#c.user
    }

    set username(value: string) {
        if (this.#cannotHaveCredentials) return
        this.#update({ user: escape(value, USERINFO_CHARS) })
    }

    /**
     * The password, `""` when there is none.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/password)
     */
    get password(): string {
        return this.#c.password
    }

    set password(value: string) {
        if (this.#cannotHaveCredentials) return
        this.#update({ password: escape(value, USERINFO_CHARS) })
    }

    /**
     * The hostname followed by `:` and the port, when the port is not the default.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/host)
     */
    get host(): string {
        const { port } = this.#c
        return port === -1 ? this.hostname : `${this.hostname}:${port}`
    }

    set host(value: string) {
        if (this.#hasOpaquePath) return

        const match = /^(\[[^\]]*\]|[^:]*)(?::(\d*))?/.exec(value)
        if (!match || !match[1]) return

        const host = match[1].replace(/^\[(.*)\]$/, "$1")
        const port = match[2] ? Number(match[2]) : this.#c.port
        if (port > 65535) return

        this.#update({ host, port })
    }

    /**
     * The domain or IP address, with IPv6 addresses in brackets.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/hostname)
     */
    get hostname(): string {
        const { host } = this.#c
        if (!host) return ""
        return host.includes(":") ? `[${host}]` : host
    }

    set hostname(value: string) {
        if (this.#hasOpaquePath) return

        const match = /^(\[[^\]]*\]|[^:]*)/.exec(value)
        if (!match || !match[1]) return

        this.#update({ host: match[1].replace(/^\[(.*)\]$/, "$1") })
    }

    /**
     * The port, `""` for the default port of the scheme.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/port)
     */
    get port(): string {
        const { port } = this.#c
        return port === -1 ? "" : String(port)
    }

    set port(value: string) {
        if (this.#cannotHaveCredentials) return

        if (value === "") {
            this.#update({ port: -1 })
            return
        }

        const match = /^\d+/.exec(String(value))
        if (!match) return

        const port = Number(match[0])
        if (port > 65535) return

        this.#update({ port })
    }

    /**
     * The path, which starts with `/` unless the URL is opaque.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/pathname)
     */
    get pathname(): string {
        return this.#c.path
    }

    set pathname(value: string) {
        if (this.#hasOpaquePath) return

        let path = escape(value, PATH_CHARS)
        if (!path.startsWith("/")) path = "/" + path

        this.#update({ path })
    }

    /**
     * The query including the leading `?`, `""` when it is empty.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/search)
     */
    get search(): string {
        const { query } = this.#c
        return query ? `?${query}` : ""
    }

    set search(value: string) {
        const query = value.startsWith("?") ? value.slice(1) : value
        this.#update({ query: query === "" ? null : escape(query, QUERY_CHARS) })
        resetSearchParams(this.#searchParams, this.#c.query ?? "")
    }

    /**
     * The query as `URLSearchParams`, changing them updates the URL.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/searchParams)
     */
    get searchParams(): URLSearchParams {
        return this.#searchParams
    }

    /**
     * The fragment including the leading `#`, `""` when it is empty.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/hash)
     */
    get hash(): string {
        const { fragment } = this.#c
        return fragment ? `#${fragment}` : ""
    }

    set hash(value: string) {
        const fragment = value.startsWith("#") ? value.slice(1) : value
        this.#update({ fragment: fragment === "" ? null : escape(fragment, FRAGMENT_CHARS) })
    }

    /**
     * Returns `href`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/toString)
     */
    toString(): string {
        return this.href
    }

    /**
     * Returns `href`, used by `JSON.stringify`.
     * [MDN](https://developer.mozilla.org/docs/Web/API/URL/toJSON)
     */
    toJSON(): string {
        return this.href
    }

    get [Symbol.toStringTag](): string {
        return "URL"
    }
}

export { URL, URLSearchParams, type URLSearchParamsInit }
