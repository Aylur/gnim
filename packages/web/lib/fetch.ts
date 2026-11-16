import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import { type BodySource, initBody, isReplayable, takeBody } from "./body.js"
import { Headers, freezeHeaders } from "./headers.js"
import { closeStream } from "./lib.js"
import { Request, type RequestInit, type RequestPriority } from "./request.js"
import { NULL_BODY_STATUS, REDIRECT_STATUS, Response, initResponse } from "./response.js"
import { toGStream } from "./stream.js"
import { URL } from "./url.js"

let defaultSession: Soup.Session | null = null

/** Same as browsers. */
const MAX_REDIRECTS = 20

function createSession() {
    return new Soup.Session({
        userAgent: GLib.get_prgname() ?? "gnim",
        timeout: 0,
        maxConnsPerHost: 6,
    })
}

function send(
    session: Soup.Session,
    message: Soup.Message,
    cancellable: Gio.Cancellable | null,
): Promise<Gio.InputStream> {
    return new Promise((resolve, reject) => {
        session.send_async(message, GLib.PRIORITY_DEFAULT, cancellable, (_, res) => {
            try {
                resolve(session.send_finish(res))
            } catch (error) {
                reject(error)
            }
        })
    })
}

function setBody(
    message: Soup.Message,
    source: BodySource | null,
    contentType: string | null,
    cancellable: Gio.Cancellable | null,
    onError: (error: unknown) => void,
) {
    switch (source?.kind) {
        case "bytes":
            message.set_request_body_from_bytes(contentType, new GLib.Bytes(source.bytes))
            break
        case "blob":
            message.set_request_body(contentType, source.blob.gstream(), source.blob.size)
            break
        case "stream":
            message.set_request_body(contentType, source.stream, -1)
            break
        case "chunks":
            message.set_request_body(
                contentType,
                toGStream(source.chunks(), { cancellable, onError }),
                source.length ?? -1,
            )
            break
        default:
            break
    }

    if (source) {
        // when a reused keep-alive connection turns out to be closed, Soup sends the request
        // again with an empty body, so requests with a body are sent on a new connection.
        // Soup does this already for non-idempotent methods such as POST, but not for PUT
        message.add_flags(Soup.MessageFlags.NEW_CONNECTION)
    }
}

const PRIORITIES: Record<RequestPriority, Soup.MessagePriority> = {
    high: Soup.MessagePriority.HIGH,
    auto: Soup.MessagePriority.NORMAL,
    low: Soup.MessagePriority.LOW,
}

async function sendMessage(
    request: Request,
    url: string,
    headers: Headers,
    source: BodySource | null,
): Promise<{ message: Soup.Message; stream: Gio.InputStream }> {
    const cancellable = request.signal
    const uri = GLib.Uri.parse(url, Soup.HTTP_URI_FLAGS)

    const scheme = uri.get_scheme()
    if (scheme !== "http" && scheme !== "https") {
        throw new TypeError(`fetch failed: scheme "${scheme}" is not supported`)
    }

    const message = new Soup.Message({ method: request.method, uri })

    const messageHeaders = message.get_request_headers()
    for (const [name, value] of headers) {
        messageHeaders.append(name, value)
    }

    let bodyError: unknown
    setBody(message, source, headers.get("content-type"), cancellable, (e) => (bodyError = e))

    if (request.redirect !== "follow") {
        message.add_flags(Soup.MessageFlags.NO_REDIRECT)
    }
    if (request.credentials === "omit") {
        message.disable_feature(Soup.CookieJar)
    }

    message.priority = PRIORITIES[request.priority]

    if (request.cache === "no-store" || request.cache === "reload") {
        if (messageHeaders.get_one("pragma") === null) {
            messageHeaders.append("Pragma", "no-cache")
        }
        if (messageHeaders.get_one("cache-control") === null) {
            messageHeaders.append("Cache-Control", "no-cache")
        }
        message.disable_feature(Soup.Cache)
    } else if (request.cache === "no-cache" && messageHeaders.get_one("cache-control") === null) {
        messageHeaders.append("Cache-Control", "max-age=0")
    }

    const session = request.session ?? (defaultSession ??= createSession())

    try {
        const stream = await send(session, message, cancellable).catch((error: unknown) => {
            throw bodyError ?? error
        })
        return { message, stream }
    } catch (error) {
        cancellable?.set_error_if_cancelled()
        throw new TypeError("fetch failed", { cause: error })
    }
}

/** The URL to follow, when Soup did not follow a redirect because it needs the body again. */
function bodyRedirect(message: Soup.Message, request: Request): URL | null {
    const status = message.statusCode
    const location = message.get_response_headers().get_one("location")
    if (request.redirect !== "follow" || (status !== 307 && status !== 308) || !location) {
        return null
    }
    return new URL(location, message.get_uri().to_string())
}

function fragmentlessHref(url: string): string {
    const parsed = new URL(url)
    parsed.hash = ""
    return parsed.href
}

/**
 * Implementation of the [fetch](https://developer.mozilla.org/docs/Web/API/Window/fetch) web API.
 *
 * @example
 *
 * ```ts
 * const res = await fetch("https://example.com/api", {
 *     method: "POST",
 *     body: JSON.stringify({ hello: "world" }),
 *     headers: { "Content-Type": "application/json" },
 * })
 *
 * const json = await res.json()
 * ```
 */
export async function fetch(
    input: string | URL | Request,
    init: RequestInit = {},
): Promise<Response> {
    const request = new Request(input, init)
    const source = takeBody(request)
    request.signal?.set_error_if_cancelled()

    let url = new URL(request.url)
    let headers = request.headers
    let redirects = 0
    let sent = await sendMessage(request, url.href, headers, source)

    // Soup does not follow 307 and 308 redirects of requests with a body, because it cannot
    // send the body again
    for (
        let next = bodyRedirect(sent.message, request);
        next;
        next = bodyRedirect(sent.message, request)
    ) {
        closeStream(sent.stream).catch(logError)

        if (!source || !isReplayable(source)) {
            throw new TypeError("fetch failed: cannot follow a redirect with a streamed body")
        }
        if (++redirects > MAX_REDIRECTS) {
            throw new TypeError("fetch failed: too many redirects")
        }
        if (next.origin !== url.origin) {
            headers = new Headers(headers)
            headers.delete("authorization")
        }

        url = next
        sent = await sendMessage(request, url.href, headers, source)
    }

    const { message, stream } = sent

    const status = message.statusCode

    if (request.redirect === "error" && REDIRECT_STATUS.includes(status)) {
        closeStream(stream).catch(logError)
        throw new TypeError("fetch failed: unexpected redirect")
    }

    const hasBody = request.method !== "HEAD" && !NULL_BODY_STATUS.includes(status)
    if (!hasBody) closeStream(stream).catch(logError)

    const finalUrl = fragmentlessHref(message.get_uri().to_string())

    const response = new Response(null, { headers: message.get_response_headers() })
    if (hasBody) initBody(response, { kind: "stream", stream, cancellable: request.signal })

    initResponse(response, {
        status,
        statusText: message.get_reason_phrase() ?? "",
        type: "basic",
        url: finalUrl,
        redirected: redirects > 0 || finalUrl !== fragmentlessHref(url.href),
    })

    freezeHeaders(response.headers)
    return response
}
