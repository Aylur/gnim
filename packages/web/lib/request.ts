import type Gio from "gi://Gio?version=2.0"
import type Soup from "gi://Soup?version=3.0"
import GObject from "gi://GObject?version=2.0"
import { Body, type BodyInit, initBody } from "./body.js"
import { Headers, type HeadersInit } from "./headers.js"
import { URL } from "./url.js"

type RequestRedirect = "follow" | "error" | "manual"
type RequestCredentials = "omit" | "same-origin" | "include"
type RequestCache =
    "default" | "no-store" | "reload" | "no-cache" | "force-cache" | "only-if-cached"
type RequestPriority = "high" | "low" | "auto"

interface RequestInit {
    method?:
        | "GET"
        | "QUERY"
        | "HEAD"
        | "POST"
        | "PUT"
        | "DELETE"
        | "CONNECT"
        | "OPTIONS"
        | "TRACE"
        | "PATCH"
        | ({} & string)
    headers?: HeadersInit
    body?: BodyInit | null
    redirect?: RequestRedirect
    signal?: Gio.Cancellable | null
    duplex?: "half"
    /**
     * Cookies are only sent and stored when the session has a `Soup.CookieJar`.
     * `"omit"` disables it for this request, the others are treated the same.
     */
    credentials?: RequestCredentials
    /**
     * The session used to send the request instead of the shared default one,
     * which can be used to add features such as a `Soup.CookieJar`, or to configure a proxy.
     */
    session?: Soup.Session | null
    /**
     * `"no-store"` and `"reload"` sets `Cache-Control: no-cache`, `Pragma: no-cache`, and
     * disables the `Soup.Cache` feature of the session. `"no-cache"` sets `Cache-Control: max-age=0`.
     */
    cache?: RequestCache
    priority?: RequestPriority
}

const NORMALIZED_METHODS = ["DELETE", "GET", "HEAD", "OPTIONS", "POST", "PUT"]
const FORBIDDEN_METHODS = ["CONNECT", "TRACE", "TRACK"]
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const REDIRECTS: RequestRedirect[] = ["follow", "error", "manual"]
const CREDENTIALS: RequestCredentials[] = ["omit", "same-origin", "include"]
const CACHES: RequestCache[] = [
    "default",
    "no-store",
    "reload",
    "no-cache",
    "force-cache",
    "only-if-cached",
]
const PRIORITIES: RequestPriority[] = ["high", "low", "auto"]

function oneOf<T extends string>(option: string, value: T, values: readonly T[]): T {
    if (!values.includes(value)) {
        throw new TypeError(`Request: invalid ${option} "${value}"`)
    }
    return value
}

function normalizeMethod(method: string): string {
    const upper = method.toUpperCase()
    if (!TOKEN.test(method) || FORBIDDEN_METHODS.includes(upper)) {
        throw new TypeError(`Request: invalid method "${method}"`)
    }
    return NORMALIZED_METHODS.includes(upper) ? upper : method
}

/**
 * Implementation of the [Request](https://developer.mozilla.org/docs/Web/API/Request) web API.
 */
class Request extends Body {
    declare static readonly $gtype: GObject.GType<Request>

    static {
        GObject.registerClass({ GTypeName: "GnimWeb_Request" }, this)
    }

    /** The URL of the request. */
    readonly url: string
    /** The method, uppercase for the standard methods. */
    readonly method: string
    /** How `fetch` handles redirects. */
    readonly redirect: RequestRedirect
    /** Cancels `fetch` and reading the response. */
    readonly signal: Gio.Cancellable | null
    /** Whether `fetch` sends and stores cookies. */
    readonly credentials: RequestCredentials
    /** The session `fetch` uses or `null` for the shared one. */
    readonly session: Soup.Session | null
    /** How `fetch` uses the HTTP cache. */
    readonly cache: RequestCache
    /** The position of the request in the queue of the session. */
    readonly priority: RequestPriority

    constructor(input: string | URL | Request, init: RequestInit = {}) {
        const { body: bodyInit = null } = init
        const base = input instanceof Request ? input : null

        const method = init.method ? normalizeMethod(init.method) : (base?.method ?? "GET")
        const headers = new Headers(init.headers ?? base?.headers ?? {})

        if ((bodyInit !== null || base?.hasBody) && (method === "GET" || method === "HEAD")) {
            throw new TypeError("Request: request with GET/HEAD method cannot have a body")
        }

        const redirect = init.redirect ?? base?.redirect ?? "follow"
        if (!REDIRECTS.includes(redirect)) {
            throw new TypeError(`Request: invalid redirect mode "${redirect}"`)
        }

        const credentials = init.credentials ?? base?.credentials ?? "same-origin"
        if (!CREDENTIALS.includes(credentials)) {
            throw new TypeError(`Request: invalid credentials mode "${credentials}"`)
        }

        if (init.duplex && init.duplex !== "half") {
            throw new TypeError(`Request: invalid duplex "${init.duplex}"`)
        }

        const cache = oneOf("cache", init.cache ?? base?.cache ?? "default", CACHES)

        super(bodyInit ?? base, headers)
        this.url = input instanceof Request ? input.url : new URL(input).href
        this.method = method
        this.redirect = redirect
        this.signal = "signal" in init ? (init.signal ?? null) : (base?.signal ?? null)
        this.credentials = credentials
        this.session = "session" in init ? (init.session ?? null) : (base?.session ?? null)
        this.cache = cache
        this.priority = oneOf("priority", init.priority ?? base?.priority ?? "auto", PRIORITIES)
    }

    /**
     * Returns a copy that can be read separately.
     * A streamed body is split between both.
     */
    clone(): Request {
        const source = this.cloneSource()
        const request = new Request(this.url, {
            method: this.method,
            headers: this.headers,
            redirect: this.redirect,
            signal: this.signal,
            credentials: this.credentials,
            session: this.session,
            cache: this.cache,
            priority: this.priority,
        })
        initBody(request, source)
        return request
    }

    get [Symbol.toStringTag](): string {
        return "Request"
    }
}

export {
    Request,
    type RequestInit,
    type RequestCredentials,
    type RequestRedirect,
    type RequestCache,
    type RequestPriority,
}
