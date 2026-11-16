import GObject from "gi://GObject?version=2.0"
import { Body, type BodyInit, initBody } from "./body.js"
import { Headers, type HeadersInit, freezeHeaders, isFrozenHeaders } from "./headers.js"
import { URL } from "./url.js"

type ResponseType = "basic" | "cors" | "default" | "error" | "opaque" | "opaqueredirect"

interface ResponseInit {
    status?: number
    statusText?: string
    headers?: HeadersInit
}

interface ResponseState {
    status: number
    statusText: string
    type: ResponseType
    url: string
    redirected: boolean
}

const NULL_BODY_STATUS = [101, 103, 204, 205, 304]
const REDIRECT_STATUS = [301, 302, 303, 307, 308]

// module private accessor used by fetch to fill in what only the network can know
let init: (response: Response, state: Partial<ResponseState>) => void

/**
 * Implementation of the [Response](https://developer.mozilla.org/docs/Web/API/Response) web API.
 */
class Response extends Body {
    declare static readonly $gtype: GObject.GType<Response>

    static {
        GObject.registerClass({ GTypeName: "GnimWeb_Response" }, this)
    }

    #state: ResponseState

    static {
        init = (response, state) => {
            Object.assign(response.#state, state)
        }
    }

    /** Creates a network error, as returned by `fetch`. */
    static error(): Response {
        const response = new Response()
        init(response, { status: 0, type: "error" })
        freezeHeaders(response.headers)
        return response
    }

    /** Creates a response with `data` serialized as its JSON body. */
    static json(data: unknown, init: ResponseInit = {}): Response {
        const body = JSON.stringify(data)
        if (typeof body !== "string") {
            throw new TypeError("Response.json: data is not JSON serializable")
        }

        const headers = new Headers(init.headers ?? {})
        if (!headers.has("content-type")) headers.set("content-type", "application/json")

        return new Response(body, { ...init, headers })
    }

    /** Creates a redirect response to `url`. */
    static redirect(url: string | URL, status = 302): Response {
        if (!REDIRECT_STATUS.includes(status)) {
            throw new RangeError(`Response.redirect: invalid redirect status ${status}`)
        }

        const response = new Response(null, {
            status,
            headers: { location: new URL(url).href },
        })
        freezeHeaders(response.headers)
        return response
    }

    constructor(body: BodyInit | null = null, init: ResponseInit = {}) {
        const { status = 200, statusText = "" } = init

        if (!Number.isInteger(status) || status < 200 || status > 599) {
            throw new RangeError(`Response: status ${status} is not in the range 200 to 599`)
        }
        if (/[\r\n]/.test(statusText)) {
            throw new TypeError("Response: invalid status text")
        }

        if (body !== null && NULL_BODY_STATUS.includes(status)) {
            throw new TypeError(`Response: response with status ${status} cannot have a body`)
        }

        super(body, new Headers(init.headers ?? {}))
        this.#state = { status, statusText, type: "default", url: "", redirected: false }
    }

    /** The HTTP status code. */
    get status(): number {
        return this.#state.status
    }

    /** The reason phrase of the status. */
    get statusText(): string {
        return this.#state.statusText
    }

    /** Whether the status is in the range 200 to 299. */
    get ok(): boolean {
        return this.status >= 200 && this.status < 300
    }

    /** The type, `"basic"` for responses of `fetch`. */
    get type(): ResponseType {
        return this.#state.type
    }

    /** The URL after redirects, `""` when the response was not fetched. */
    get url(): string {
        return this.#state.url
    }

    /** Whether `fetch` followed a redirect. */
    get redirected(): boolean {
        return this.#state.redirected
    }

    /**
     * Returns a copy that can be read separately.
     * A streamed body is split between both.
     */
    clone(): Response {
        const response = new Response(null, { headers: this.headers })
        initBody(response, this.cloneSource())
        init(response, { ...this.#state })
        if (isFrozenHeaders(this.headers)) freezeHeaders(response.headers)
        return response
    }

    get [Symbol.toStringTag](): string {
        return "Response"
    }
}

export { Response, type ResponseInit, init as initResponse, NULL_BODY_STATUS, REDIRECT_STATUS }
