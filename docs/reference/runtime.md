# JavaScript Runtime

Globals available in the Gnome JavaScript runtime on top of standard ECMAScript.

This page might be out of date. Upstream documentation can be found on
[gitlab](https://gitlab.gnome.org/GNOME/gjs/-/tree/master/doc?ref_type=heads)

## Globals

### `console`

GJS implements the [WHATWG Console](https://console.spec.whatwg.org/)
specification, with log severity mapped to `GLib.LogLevelFlags`.

```ts
const console: Console
```

Example:

```ts
console.log("Hello", { world: true })
```

`console.profile()`, `console.profileEnd()` and `console.timeStamp()` are not
implemented. Messages are logged with the `Gjs-Console` log domain by default,
see [`setConsoleLogDomain`](#setconsolelogdomain).

> [!WARNING]
>
> Stack traces of errors printed with `console` methods are not source mapped.
> Prefer [`logError`](#logerror) for logging errors.

### `logError`

Logs a stack trace for `error`, with an optional prefix, with severity
`GLib.LogLevelFlags.LEVEL_WARNING`.

```ts
function logError(error: Error | GLib.Error, prefix?: string): void
```

Example:

```ts
try {
  file.load_contents(null)
} catch (error) {
  logError(error, "failed to load file")
}
```

Unlike `console.error`, `logError` prints source mapped stack traces, so prefer
it when logging errors.

### `log`

Logs a message with severity `GLib.LogLevelFlags.LEVEL_MESSAGE`.

```ts
function log(message: any): void
```

Example:

```ts
log("Hello World")
```

Prefer [`console.log`](#console-log).

### `print`

Joins its arguments with a space, appends a newline and prints the result to
`stdout` with `g_print()`.

```ts
function print(...messages: any[]): void
```

Example:

```ts
print("Hello", "World") // Hello World
```

Unlike `console.log`, the output is not a log message and has no log domain or
severity.

### `printerr`

Joins its arguments with a space, appends a newline and prints the result to
`stderr` with `g_printerr()`.

```ts
function printerr(...messages: any[]): void
```

Example:

```ts
printerr("usage: my-app [FILE]")
```

### `setTimeout`

Schedules `handler` to run once after `timeout` milliseconds. Any extra
arguments are passed to `handler`.

```ts
function setTimeout<TArgs extends any[]>(
  handler: (...args: TArgs) => void,
  timeout?: number,
  ...args: TArgs
): GLib.Source
```

Example:

```ts
const source = setTimeout(() => {
  console.log("one second has passed")
}, 1000)
```

### `clearTimeout`

Cancels a timeout created with [`setTimeout`](#settimeout) or
[`setInterval`](#setinterval).

```ts
function clearTimeout(id: GLib.Source): void
```

Example:

```ts
const source = setTimeout(callback, 1000)
clearTimeout(source)
```

### `setInterval`

Schedules `handler` to run every `timeout` milliseconds. Any extra arguments are
passed to `handler`.

```ts
function setInterval<TArgs extends any[]>(
  handler: (...args: TArgs) => void,
  timeout?: number,
  ...args: TArgs
): GLib.Source
```

Example:

```ts
const source = setInterval(() => {
  console.log("tick")
}, 1000)
```

### `clearInterval`

Cancels an interval created with [`setInterval`](#setinterval) or
[`setTimeout`](#settimeout).

```ts
function clearInterval(id: GLib.Source): void
```

Example:

```ts
const source = setInterval(callback, 1000)
clearInterval(source)
```

### `TextEncoder`

Encodes strings into UTF-8 bytes, as specified by the
[Encoding Standard](https://encoding.spec.whatwg.org/).

```ts
class TextEncoder {
  encode(input: string): Uint8Array
}
```

Example:

```ts
const bytes = new TextEncoder().encode("Hello")
```

Useful for passing strings to APIs that take `GLib.Bytes` or `Uint8Array`, such
as `Gio.File.replace_contents`.

### `TextDecoder`

Decodes bytes into a string, as specified by the
[Encoding Standard](https://encoding.spec.whatwg.org/).

```ts
class TextDecoder {
  constructor(label?: TextDecoderEncoding, options?: { fatal?: boolean })

  decode(
    buffer?: ArrayBuffer | ArrayBufferView | DataView | null,
    options?: { stream?: boolean },
  ): string
}
```

Example:

```ts
const [, contents] = file.load_contents(null)
const text = new TextDecoder().decode(contents)
```

`label` defaults to `"utf-8"`. When `fatal` is `true`, invalid input throws a
`TypeError` instead of being replaced with `U+FFFD`.

### `import.meta.url`

The absolute `file:` or `resource:` URL of the current module.

```ts
interface ImportMeta {
  url: string
}
```

Example:

```ts
import GLib from "gi://GLib?version=2.0"

const [filename] = GLib.filename_from_uri(import.meta.url)
const dirname = GLib.path_get_dirname(filename)
```

> [!IMPORTANT]
>
> It points to the transpiled JavaScript file, not the source TypeScript file.

## `system`

Low-level facilities such as process arguments, `exit()` and debugging helpers.

> [!NOTE]
>
> Only commonly used members are documented on this page. Documentation for the
> rest of the symbols can be found on
> [gitlab](https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/System.md?ref_type=heads).
> Most functions in this module should not be used in application code.

```ts
namespace System {
  /** Corresponds to `argv[0]` in C. */
  const programInvocationName: string
  /** Command line arguments without `argv[0]`. */
  const programArgs: string[]
  /** GJS version */
  const version: number
  /** Exit the program */
  function exit(code: number): never
}
```

Example:

```ts
import System from "system"
// or
import { exit, programInvocationName, programArgs } from "system"

exit(0)
System.exit(0)

let app: Gtk.Application

app.runAsync([programInvocationName, ...programArgs])
```

## `gettext`

A convenience layer over the gettext family of functions, implemented by GLib.

> [!NOTE]
>
> Gnim provides a higher level API in [`gnim/intl`](/tutorial/intl) and so
> `gettext` namespace documentation on this page is partial.

```ts
namespace Gettext {
  enum LocaleCategory {
    CTYPE = 0,
    NUMERIC = 1,
    TIME = 2,
    COLLATE = 3,
    MONETARY = 4,
    MESSAGES = 5,
    ALL = 6,
  }

  function setlocale(
    category: LocaleCategory,
    locale: string | null,
  ): string | null
}
```

Example:

```ts
import Gettext from "gettext"
// or
import { LocaleCategory, setlocale } from "gettext"

const current = setlocale(LocaleCategory.ALL, null)
```

Pass `null` as `locale` to query the current locale. It is rarely necessary to
call this, GJS sets the locale from the environment on startup.

## `console`

Configures the global [`console`](#console) object.

```ts
namespace Console {
  const DEFAULT_LOG_DOMAIN: "Gjs-Console"
  function setConsoleLogDomain(domain: string): void
}
```

Example:

```ts
import Console from "console"
// or
import { setConsoleLogDomain } from "console"

// Sets the GLib log domain of the global console.
setConsoleLogDomain("com.example.MyApp")
```
