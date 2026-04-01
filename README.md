# Gnim

Library that brings JSX, reactivity and type-safety to GNOME JavaScript.

## Templates

- [gnome-extension](https://github.com/Aylur/gnome-shell-extension-template/)
- [gtk4](https://github.com/Aylur/gnim-gtk4-template/)

## JSX and reactivity

Build reactive GTK interfaces with familiar JSX syntax. Create signals, derive
computed values, and let the UI update automatically when state changes.

```tsx
function Counter() {
  const [count, setCount] = createState(0)

  function increment() {
    setCount((v) => v + 1)
  }

  effect(() => {
    console.log("count is", count())
  })

  return (
    <Gtk.Box spacing={8}>
      <Gtk.Label label={count((c) => c.toString())} />
      <Gtk.Button onClicked={increment}>Increment</Gtk.Button>
    </Gtk.Box>
  )
}

let win: Gtk.Window
render(Counter, win)
```

## GObject decorators

Define GObject classes with clean, declarative TypeScript decorators.

```ts
import GObject from "gi://GObject?version=2.0"
import { register, property, signal } from "gnim/gobject"

@register
class MyObj extends GObject.Object {
  @property myProp: string = ""

  @signal mySignal(a: string, b: number): void {
    print(a, b)
  }
}
```

## DBus decorators

Create DBus services and proxies with ease. Decorators handle interface
generation and type marshalling for both client and server implementations.

```ts
import { Service, iface, methodAsync, signal, property } from "gnim/dbus"

@iface("example.gjs.MyService")
export class MyService extends Service {
  @property("s") MyProperty = ""

  @methodAsync(["s"], ["s"])
  async MyMethod(str: string): Promise<[string]> {
    return [str]
  }

  @signal("s")
  MySignal(str: string) {
    print(str)
  }
}
```

## Gio Settings

Define your app's settings schema in TypeScript and get reactive, type-safe
access to GSettings. Schema XML can be generated at build time that integrates
into existing tooling.

```ts
import GLib from "gi://GLib?version=2.0"
import { defineSchemaList, Schema, Enum, Flags } from "gnim/schema"

const myFlags = new Flags("my.flags", ["one", "two"])
const myEnum = new Enum("my.enum", ["one", "two"])

export const schema = new Schema({
  id: "com.example.MyApp",
  path: "/com/example/myapp/",
})
  .key("my-key", "s", {
    default: "",
    summary: "Simple string key",
  })
  .key("complex-key", "a{sv}", {
    default: {
      key: GLib.Variant.new("s", "value"),
    },
    summary: "Variant dict key",
  })
  .key("enum-key", myEnum, {
    default: "one",
  })
  .key("flags-key", myFlags, {
    default: ["one", "two"],
  })

export default defineSchemaList([schema])
```

```ts
import { schema } from "./com.example.MyApp.gschema"
import { createSettings } from "gnim/schema"

const settings = createSettings(schema)

effect(() => {
  print(settings.myKey())
})

settings.setMyKey("hello")
```

## Text formatting

Type-safe text formatting that warns you on missing slots.

```tsx
import { createDomain, fmt } from "gnim/i18n"

const { gettext: t, ngettext: n } = createDomain("com.example.MyApp")

function App() {
  const [count, setCount] = createState(0)

  return (
    <Gtk.Button onClicked={() => setCount((c) => c + 1)}>
      <Gtk.Label label={t("Click Me!")} />
      <Gtk.Label
        label={count.as((c) =>
          fmt(n("Clicked once", "Clicked {{count}} times", c), { count: c }),
        )}
      />
    </Gtk.Button>
  )
}
```

## Asset handling

Import assets that are automatically bundled with zero setup.

```tsx
import image from "./assets/image?file"

return <Gtk.Picture file={image} />
```
