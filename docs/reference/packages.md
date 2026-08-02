# Packages

The core `gnim` package is renderer agnostic: it implements JSX, reactivity and
the GObject utilities, but it does not know how to attach objects to each other.
That job is done by a renderer package, which provides the `render` function.
There is a renderer for Gtk4, Gtk3 and GNOME Shell, and an additional utility
package for common IO operations.

| Package                | Purpose                                        |
| ---------------------- | ---------------------------------------------- |
| `@gnim-js/gtk4`        | Gtk4 renderer                                  |
| `@gnim-js/gtk3`        | Gtk3 renderer                                  |
| `@gnim-js/gnome-shell` | Clutter/St renderer for GNOME Shell extensions |
| `@gnim-js/io`          | Timers, file system and subprocess utilities   |

## `@gnim-js/gtk4`

### `render`

Mounts a JSX tree and returns a dispose function that tears down its scope.

```ts
function render(element: () => GnimNode, root?: GObject.Object): () => void
```

Example:

```tsx
import Gtk from "gi://Gtk?version=4.0"
import { render } from "@gnim-js/gtk4"

const dispose = render(() => (
  <Gtk.Window visible>
    <Gtk.Label label="Hello" />
  </Gtk.Window>
))
```

The renderer also defines the `slot`, `css` and `class` JSX attributes.

### `slot`

Under the hood, to build the widget tree the renderer uses the
[Gtk.Buildable](https://docs.gtk.org/gtk4/iface.Buildable.html) interface. The
`slot` attribute specifies the type the `child` is meant to be.

```tsx
<Gtk.CenterBox>
  <Gtk.Box slot="start" />
  <Gtk.Box slot="center" />
  <Gtk.Box slot="end" />
</Gtk.CenterBox>
```

### `css`

An additional `css` attribute is available on class components that inherit from
`Gtk.Widget`. It is mostly meant to be used as a debugging tool, e.g. with
`css="border: 1px solid red;"`.

```tsx
<Gtk.Button css="border: 1px solid red;" />
```

### `class`

The `class` attribute is available on class components that inherit from
`Gtk.Widget`. It is an alternative to the Gtk4 `cssClasses` property which can
take class names in various forms.

```tsx
const name: string | Accessor<string> | string[] | Accessor<string[]>

return (
  <Gtk.Button
    class="class1 class2"
    class={name}
    class={["class1 class2", name]}
  />
)
```

> [!WARNING]
>
> Passing `cssClasses` or `class` assigns the widget's `css-classes` property,
> which means any class name that a widget might have by default will be
> overwritten. To preserve them, they have to be explicitly specified. Or you
> might want to imperatively append/remove class names instead.
>
> ```tsx
> return <Gtk.Window class={["background", "MyWindow"]} />
>
> return <Gtk.Window ref={(self) => self.add_css_class("MyWindow")} />
> ```

### `getSlot`

Reads back the `slot` attribute that was set on an object in JSX.

```ts
function getSlot(object: GObject.Object): string | undefined
```

### `createListItemFactory`

Creates a `Gtk.ListItemFactory` for view widgets such as `Gtk.ListView` and
`Gtk.GridView`, letting you declare list items in JSX.

```ts
type Item<T extends GObject.Object> = Gtk.ListItem & {
  item: T | null
}

function createListItemFactory<T extends GObject.Object>(
  factory: (item: Accessor<Item<T> | null>) => GnimNode,
): Gtk.ListItemFactory
```

The factory function receives an `Accessor` of the `Gtk.ListItem`, which is
`null` while the item is not bound to a value.

Example:

```tsx
import Gtk from "gi://Gtk?version=4.0"
import { createListItemFactory } from "@gnim-js/gtk4/listItemFactory"

function StringList() {
  const model = Gtk.StringList.new(["one", "two", "three"])

  const factory = createListItemFactory<Gtk.StringObject>((listItem) => (
    <Gtk.Label label={listItem.as((li) => li?.item?.string ?? "")} />
  ))

  return <Gtk.ListView model={Gtk.NoSelection.new(model)} factory={factory} />
}
```

> [!NOTE]
>
> `createListItemFactory` captures the current reactive scope, so it has to be
> called from inside one, for example in the body of a function component.

### `style`

> [!WARNING]
>
> `style` and `keyframes` are experimental.

CSS-in-JS: takes an object of
[Gtk CSS properties](https://docs.gtk.org/gtk4/css-properties.html) and returns
a generated class name. Nested selectors are supported with the `&` prefix and
media queries with `@media` keys.

```ts
function style(props: Style): string
function style(producer: () => Style): Accessor<string>
```

Example:

```tsx
import { style } from "@gnim-js/gtk4"

const className = style({
  "color": "red",
  "&:hover": {
    color: "blue",
  },
})

return <Gtk.Label class={className} label="styled" />
```

Identical style objects are deduplicated into a single stylesheet, and
stylesheets are removed from the display when every scope using them is
disposed. The producer form returns an `Accessor` that recomputes the stylesheet
when its dependencies change.

### `keyframes`

> [!WARNING]
>
> `style` and `keyframes` are experimental.

Defines a CSS `@keyframes` animation and returns its generated name. Keys are
either `from`/`to` or percentages.

```ts
type Keyframes =
  | { from: CssProperties; to: CssProperties }
  | { [percentage: number]: CssProperties }

function keyframes(keyframes: Keyframes): string
function keyframes(keyframes: () => Keyframes): Accessor<string>
```

Example:

```tsx
import { keyframes, style } from "@gnim-js/gtk4"

const spin = keyframes({
  from: { transform: "rotate(0turn)" },
  to: { transform: "rotate(1turn)" },
})

const className = style({
  animation: `${spin} 1s linear infinite`,
})
```

## `@gnim-js/gtk3`

Exports `render` with the same signature as the Gtk4 package and defines the
same [`slot`](#slot), [`css`](#css) and [`class`](#class) JSX attributes.

Differences from Gtk4:

- Every constructed object gets `visible: true` by default, since in Gtk3
  widgets are hidden unless shown explicitly.
- Gtk3 has no `cssClasses` property; the `class` JSX attribute manipulates style
  classes through the widget's `Gtk.StyleContext`.

## `@gnim-js/gnome-shell`

> [!WARNING]
>
> GNOME Shell support is experimental.

Renderer for GNOME Shell extensions. Instead of Gtk widgets it renders
Clutter/St actors: text nodes become `St.Label`, `Clutter.Actor` children are
added with `add_child`, and `Clutter.Action`, `Clutter.Constraint` and
`Clutter.LayoutManager` children are attached through their respective APIs. The
Gtk-specific `css`, `class` and `slot` JSX attributes are not available.

```tsx
import { render } from "@gnim-js/gnome-shell"
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js"
import PanelButton from "./PanelButton"

export default class extends Extension {
  enable(): void {
    this.disable = render(() => <PanelButton />)
  }
}
```

The package ships `.gir` files for the GNOME Shell libraries (`Clutter`, `Cogl`,
`Meta`, `Mtk`, `St`, `Shell`, `Gvc`) under `gir-1.0/gnome<version>`, which can
be fed to the [CLI](/reference/cli#gnim-types) to generate types:

```sh
gnim types -d node_modules/@gnim-js/gnome-shell/gir-1.0/gnome50 --alias
```

> [!TIP]
>
> The quickest way to get a working extension setup is the `gnome-shell`
> template:
>
> ```sh
> npm create gnim@beta -- --template gnome-shell
> ```

## `@gnim-js/io`

Utilities for timers, files and subprocesses. The package has three subpath
exports and no root export.

### `@gnim-js/io/timer`

> [!IMPORTANT]
>
> `Timer` exists mostly for legacy reasons, newly written code might prefer
> `setTimeout` and `setInterval`.

#### `Timer`

A GObject wrapping GLib timeout sources. It emits a `now` signal on each tick
and a `cancelled` signal when cancelled with `cancel()`.

```ts
const timer = Timer.interval(1000, () => console.log("every second"))
const once = Timer.timeout(1000, () => console.log("after a second"))
const idle = Timer.idle(() => console.log("when the loop is idle"))

timer.cancel()
```

`interval`, `timeout` and `idle` are also exported as standalone functions.

- `interval(interval, callback?)` runs the callback immediately, then repeatedly
  at a fixed interval in milliseconds.
- `timeout(interval, callback?)` runs the callback once after a delay.
- `idle(callback?)` runs the callback once when there is nothing else to do on
  the event loop.

#### `createPoll`

Creates an `Accessor` that polls at a fixed interval, either by running a
function or by executing a command.

```ts
function createPoll(
  init: string,
  interval: number,
  exec: string | string[],
): Accessor<string>

function createPoll<T>(
  init: T,
  interval: number,
  exec: string | string[],
  transform: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T>

function createPoll<T>(
  init: T,
  interval: number,
  fn: (prev: T) => T | Promise<T>,
): Accessor<T>
```

Example:

```ts
import { createPoll } from "@gnim-js/io/timer"

const date = createPoll("", 1000, "date")

effect(() => {
  console.log(date())
})
```

> [!NOTE]
>
> Polling is lazy: it starts when the first subscriber appears and stops when
> the number of subscribers drops to zero. Until then the accessor holds the
> `init` placeholder value.

### `@gnim-js/io/fs`

#### `readFile`, `readFileAsync`

Read the contents of a file as a UTF-8 string.

```ts
function readFile(file: string | Gio.File): string
function readFileAsync(file: string | Gio.File): Promise<string>
```

#### `writeFile`, `writeFileAsync`

Replace the contents of a file, creating parent directories when they do not
exist.

```ts
function writeFile(file: string | Gio.File, content: string): Gio.File
function writeFileAsync(
  file: string | Gio.File,
  content: string,
): Promise<Gio.File>
```

#### `monitorFile`

Monitors a file, or a directory and all of its subdirectories recursively. Newly
created directories are monitored automatically, and the monitor cancels itself
when the watched path is deleted.

```ts
function monitorFile(
  path: string,
  callback: (filePath: string, event: Gio.FileMonitorEvent) => void,
): Gio.FileMonitor
```

Example:

```ts
import { monitorFile } from "@gnim-js/io/fs"

const monitor = monitorFile("/path/to/dir", (path, event) => {
  console.log(path, event)
})

monitor.cancel()
```

### `@gnim-js/io/process`

#### `Process`

A GObject abstraction over `Gio.Subprocess` with piped stdin, stdout and stderr.
It emits `stdout(line)` and `stderr(line)` signals for each line of output and
an `exit(code, signaled)` signal when the process ends.

```ts
const proc = new Process({ argv: ["command", "arg"] })

proc.connect("stdout", (_, line) => console.log(line))
proc.connect("exit", (_, code) => console.log("exited with", code))

await proc.write("input\n")
proc.signal(15)
proc.kill()
```

#### `subprocess`

Starts a long-running child process and wires up the output callbacks, which
default to `print` and `printerr`.

```ts
function subprocess(args: {
  cmd: string | string[]
  out?: (stdout: string) => void
  err?: (stderr: string) => void
}): Process

function subprocess(
  cmd: string | string[],
  onOut?: (stdout: string) => void,
  onErr?: (stderr: string) => void,
): Process
```

#### `exec`, `execAsync`

Execute a command and return its trimmed stdout. When the command exits
unsuccessfully, its stderr is thrown as an `Error`. String commands are parsed
with `GLib.shell_parse_argv`; array commands are executed as-is.

```ts
function exec(cmd: string | string[]): string
function execAsync(cmd: string | string[]): Promise<string>
```

Example:

```ts
import { execAsync } from "@gnim-js/io/process"

try {
  const stdout = await execAsync("uname -a")
  console.log(stdout)
} catch (error) {
  console.error(error)
}
```

> [!IMPORTANT]
>
> Commands are not run in a shell: expansions like `$VAR`, `~` or pipes will not
> work. To use shell features spawn one explicitly, e.g.
>
> ```ts
> execAsync(["bash", "-c", "command | other"])
> ```

#### `createSubprocess`

Creates an `Accessor` fed by the stdout of a long-running subprocess. Like
[`createPoll`](#createpoll), it is lazy: the process is spawned when the first
subscriber appears and killed when the number of subscribers drops to zero.

```ts
function createSubprocess(
  init: string,
  exec: string | string[],
): Accessor<string>

function createSubprocess<T>(
  init: T,
  exec: string | string[],
  transform: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T>
```

Example:

```ts
import { createSubprocess } from "@gnim-js/io/process"

const line = createSubprocess("", ["journalctl", "-f"])

effect(() => {
  console.log(line())
})
```
