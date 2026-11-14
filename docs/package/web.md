# `@gnim-js/web`

Implementations of some web APIs that GJS does not implement.

```ts
import { fetch, URL } from "@gnim-js/web"

const url = new URL("https://some-site.com/api")
url.searchParams.set("hello", "world")

const res = await fetch(url, {
  method: "POST",
  body: JSON.stringify({ hello: "world" }),
  headers: {
    "Content-Type": "application/json",
  },
})

const json = await res.json()
```

## `fetch`

Implementation of
[`fetch`](https://developer.mozilla.org/docs/Web/API/Window/fetch) built on
[Soup](https://libsoup.gnome.org/libsoup-3.0/index.html).

```ts
function fetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response>
```

### Session

Requests are sent with a shared
[`Soup.Session`](https://libsoup.gnome.org/libsoup-3.0/class.Session.html). A
different session can be passed with the non-standard `session` option, for
example one with a
[`Soup.CookieJar`](https://libsoup.gnome.org/libsoup-3.0/class.CookieJar.html).
Its cookies are sent and stored unless `credentials` is `"omit"`.

```ts
import Soup from "gi://Soup?version=3.0"

const session = new Soup.Session()
session.add_feature(new Soup.CookieJar())

await fetch("https://some-site.com/login", { method: "POST", session })
await fetch("https://some-site.com/me", { session })
```

A session can also connect to a unix socket.

```ts
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"

const session = new Soup.Session({
  remoteConnectable: Gio.UnixSocketAddress.new("/tmp/app.sock"),
})

const res = await fetch("http://localhost/", { session })
```

### Cancellation

[`AbortSignal`](https://developer.mozilla.org/docs/Web/API/AbortSignal) is not
implemented, instead requests are cancelled with a
[`Gio.Cancellable`](https://docs.gtk.org/gio/class.Cancellable.html).

```ts
const signal = new Gio.Cancellable()
setTimeout(() => signal.cancel(), 5000)

const res = await fetch("https://some-site.com/slow", { signal })
```

## `Request`

Implementation of
[`Request`](https://developer.mozilla.org/docs/Web/API/Request). Extends
[`Body`](#body).

```ts
class Request extends Body {
  constructor(input: string | URL | Request, init?: RequestInit)

  readonly url: string
  readonly method: string
  readonly redirect: RequestRedirect
  readonly signal: Gio.Cancellable | null
  readonly credentials: RequestCredentials
  readonly session: Soup.Session | null
  readonly cache: RequestCache
  readonly priority: RequestPriority

  clone(): Request
}
```

### `RequestInit`

[`RequestInit`](https://developer.mozilla.org/docs/Web/API/RequestInit) is
accepted by both the `Request` constructor and `fetch`.

```ts
interface RequestInit {
  method?: string
  headers?: HeadersInit
  body?: BodyInit | null
  redirect?: "follow" | "error" | "manual"
  signal?: Gio.Cancellable | null
  duplex?: "half"
  credentials?: "omit" | "same-origin" | "include"
  cache?:
    | "default"
    | "no-store"
    | "reload"
    | "no-cache"
    | "force-cache"
    | "only-if-cached"
  priority?: "high" | "low" | "auto"
  session?: Soup.Session | null
}
```

## `Response`

Implementation of
[`Response`](https://developer.mozilla.org/docs/Web/API/Response). Extends
[`Body`](#body).

```ts
class Response extends Body {
  static error(): Response
  static json(data: unknown, init?: ResponseInit): Response
  static redirect(url: string | URL, status?: number): Response

  constructor(body?: BodyInit | null, init?: ResponseInit)

  readonly status: number
  readonly statusText: string
  readonly ok: boolean
  readonly type: ResponseType
  readonly url: string
  readonly redirected: boolean

  clone(): Response
}

type ResponseType =
  "basic" | "cors" | "default" | "error" | "opaque" | "opaqueredirect"

interface ResponseInit {
  status?: number
  statusText?: string
  headers?: HeadersInit
}
```

## `Body`

The [body](https://developer.mozilla.org/docs/Web/API/Request#instance_methods)
methods shared by `Request` and `Response`.

```ts
abstract class Body {
  readonly headers: Headers
  readonly bodyUsed: boolean
  readonly body: never
  readonly gstream: Gio.InputStream | null

  chunks(chunkSize?: number): AsyncGenerator<Uint8Array>
  bytes(): Promise<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
  json<T = unknown>(): Promise<T>
  blob(): Promise<Blob>
  formData(): Promise<FormData>
}
```

[ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
is not implemented causing `body` to be `never`. Use `gstream` and `chunks()`
instead.

### `BodyInit`

The types that can be used as the body of a `Request` or `Response`.

```ts
type BodyInit =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | URLSearchParams
  | Blob
  | FormData
  | GLib.Bytes
  | Gio.InputStream
  | Gio.File
  | AsyncIterable<Uint8Array | string>
```

A `Gio.File` is opened only when the body is read, and its `Content-Type` is
guessed from the file name. A `Gio.InputStream` is closed once it has been read.

## `Headers`

Implementation of
[`Headers`](https://developer.mozilla.org/docs/Web/API/Headers).

```ts
type HeadersInit =
  | Headers
  | Soup.MessageHeaders
  | Iterable<readonly [string, string]>
  | Record<string, string>

class Headers {
  constructor(init?: HeadersInit)

  append(name: string, value: string): void
  delete(name: string): void
  get(name: string): string | null
  getSetCookie(): string[]
  has(name: string): boolean
  set(name: string, value: string): void
}
```

## `URL`

Implementation of [`URL`](https://developer.mozilla.org/docs/Web/API/URL) on top
of [`GLib.Uri`](https://docs.gtk.org/glib/struct.Uri.html), from which it can
also be created.

```ts
class URL {
  static canParse(url: string | URL, base?: string | URL): boolean
  static parse(url: string | URL, base?: string | URL): URL | null

  constructor(url: GLib.Uri)
  constructor(url: string | URL, base?: string | URL)

  href: string
  readonly origin: string
  protocol: string
  username: string
  password: string
  host: string
  hostname: string
  port: string
  pathname: string
  search: string
  readonly searchParams: URLSearchParams
  hash: string
}
```

> [!WARNING]
>
> `GLib.Uri` follows RFC 3986 instead of the WHATWG URL spec that browsers
> implement, so some edge cases do not behave the same as in browsers, such as
> backslashes, `file:` URLs with drive letters, normalizing IP addresses and
> which characters are percent-encoded.

## `URLSearchParams`

Implementation of
[`URLSearchParams`](https://developer.mozilla.org/docs/Web/API/URLSearchParams).

```ts
type URLSearchParamsInit =
  | string
  | URLSearchParams
  | Iterable<readonly [string, string]>
  | Record<string, string>

class URLSearchParams {
  constructor(init?: URLSearchParamsInit)

  readonly size: number

  append(name: string, value: string): void
  delete(name: string, value?: string): void
  get(name: string): string | null
  getAll(name: string): string[]
  has(name: string, value?: string): boolean
  set(name: string, value: string): void
  sort(): void
}
```

## `Blob`

Implementation of [`Blob`](https://developer.mozilla.org/docs/Web/API/Blob). Its
contents are kept in memory, except for `Gio.File` parts, which are read from
disk when the blob is read.

```ts
class Blob {
  constructor(parts?: Iterable<BlobPart>, options?: BlobPropertyBag)

  readonly size: number
  readonly type: string

  slice(start?: number, end?: number, contentType?: string): Blob
  stream(): never
  gstream(): Gio.InputStream
  bytes(): Promise<Uint8Array>
  arrayBuffer(): Promise<ArrayBuffer>
  text(): Promise<string>
}

type BlobPart =
  Blob | string | ArrayBuffer | ArrayBufferView | GLib.Bytes | Gio.File

interface BlobPropertyBag {
  type?: string
  endings?: "transparent" | "native"
}
```

[ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)
is not implemented causing `stream()` to be `never`. Use `gstream()` instead.

## `File`

Implementation of [`File`](https://developer.mozilla.org/docs/Web/API/File).
Extends [`Blob`](#blob).

```ts
class File extends Blob {
  constructor(
    parts: Iterable<BlobPart>,
    name: string,
    options?: FilePropertyBag,
  )
  constructor(file: Gio.File, name?: string)

  readonly name: string
  readonly lastModified: number
}

interface FilePropertyBag extends BlobPropertyBag {
  lastModified?: number
}
```

When created from a `Gio.File`, it is named after the file by default, with its
type guessed from the name. Its size is read when it is created, and its
contents when it is read, failing if the file got shorter.

## `FormData`

Implementation of
[`FormData`](https://developer.mozilla.org/docs/Web/API/FormData). A `Blob` or
`Gio.File` value becomes a [`File`](#file).

```ts
class FormData {
  append(name: string, value: string): void
  append(name: string, value: Blob | Gio.File, filename?: string): void
  delete(name: string): void
  get(name: string): FormDataEntryValue | null
  getAll(name: string): FormDataEntryValue[]
  has(name: string): boolean
  set(name: string, value: string): void
  set(name: string, value: Blob | Gio.File, filename?: string): void
}

type FormDataEntryValue = string | File
```

Example:

```ts
import Gio from "gi://Gio"
import { fetch, File, FormData } from "@gnim-js/web"

const form = new FormData()
form.append("name", "value")
form.append(
  "upload",
  new File(["contents"], "file.txt", { type: "text/plain" }),
)
form.append("photo", Gio.File.new_for_path("photo.png"))

await fetch("https://some-site.com/upload", { method: "POST", body: form })
```

## `serve`

> [!IMPORTANT]
>
> `serve` is experimental.

Starts an HTTP using
[`Soup.Server`](https://libsoup.gnome.org/libsoup-3.0/class.Server.html) as the
backend.

```ts
function serve(options: ServeOptions): {
  readonly url: URL | null
  readonly soup: Soup.Server
  remoteAddress(request: Request): Gio.SocketAddress | null
  stop(): void
}
```

- `url`: `null` when listening on a unix socket.
- `soup`: the underlying `Soup.Server`.
- `remoteAddress()`: the address of the client that sent `request`.
- `stop()`: closes the listeners and all connections.

Example:

```ts
import GLib from "gi://GLib?version=2.0"
import { serve, Response, URL } from "@gnim-js/web"

const server = serve({
  port: 8000,
  async fetch(request, server) {
    const { pathname } = new URL(request.url)
    if (pathname === "/echo") return new Response(request.gstream)
    return Response.json({ from: server.remoteAddress(request)?.to_string() })
  },
})

console.log(`listening on ${server.url}`)
GLib.MainLoop.new(null, false).runAsync()

server.stop()
```

### `ServeOptions`

```ts
type ServeOptions = (
  { port?: number; hostname?: string } | { unix: string }
) & {
  fetch(request: Request, server: Server): Response | Promise<Response>
  error?(error: unknown): Response | Promise<Response>
  tls?: { cert: string | Gio.File; key: string | Gio.File } | Gio.TlsCertificate
  cancellable?: Gio.Cancellable | null
  serverHeader?: string
  tlsAuthMode?: Gio.TlsAuthenticationMode
  tlsDatabase?: Gio.TlsDatabase | null
  rawPaths?: boolean
}
```

- `port`: defaults to `0`, which picks a free port.
- `hostname`: `"localhost"` or an IP address. Defaults to `"localhost"`.
- `unix`: path of a unix socket to listen on.
- `fetch`: answers a request, called as soon as its headers arrived. The
  `signal` of the request is cancelled when the client disconnects.
- `error`: creates the response when `fetch` throws, defaults to a `500`
  response.
- `tls`: serves HTTPS with a certificate and its private key.
- `cancellable`: stops the server once it is cancelled, same as `stop()`.
- [`serverHeader`](https://libsoup.gnome.org/libsoup-3.0/property.Server.server-header.html):
  the value of the `Server` header of responses.
- [`tlsAuthMode`](https://libsoup.gnome.org/libsoup-3.0/property.Server.tls-auth-mode.html):
  whether clients have to authenticate with a certificate that is verified
  against `tlsDatabase`.
- [`tlsDatabase`](https://libsoup.gnome.org/libsoup-3.0/property.Server.tls-database.html):
  the database client certificates are verified against.
- [`rawPaths`](https://libsoup.gnome.org/libsoup-3.0/property.Server.raw-paths.html):
  keep percent-encoded characters in the path of requests as they are.

## Differences from browsers and other runtimes

- There is no `AbortSignal`, so `signal` is a `Gio.Cancellable` instead.
- There is no origin, so `credentials: "same-origin"` behaves like `"include"`.
- `ReadableStream` is not implemented. Bodies are streamed with
  `Gio.InputStream` or async iterables, `Blob.gstream()` returns a
  `Gio.InputStream` and accessing `body` throws.
- `redirect: "manual"` resolves with the redirect response.
- `URL` parsing follows RFC 3986 instead of the WHATWG URL spec, see
  [`URL`](#url).
