# Gnim

A library that brings JSX, reactivity, and type safety to GNOME JavaScript.

- [TypeScript support](/reference/typescript) for generating GObject
  Introspection type annotations
- [JSX and reactivity](/reference/jsx) for both Gtk applications and GNOME
  extensions
- [GObject decorators](/reference/gobject) as a convenient way to subclass
  GObjects
- [DBus decorators](/reference/dbus) for implementing DBus services and proxies

## Get started

::: code-group

```sh [npm]
npm create gnim@alpha
```

```sh [pnpm]
pnpm create gnim@alpha
```

```sh [yarn]
yarn create gnim@alpha
```

```sh [bun]
bun create gnim@alpha
```

```sh [deno]
deno init --npm gnim@alpha
```

:::

## Obligatory Counter Example

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
      <Gtk.Label label={count.as(String)} />
      <Gtk.Button onClicked={increment}>Increment</Gtk.Button>
    </Gtk.Box>
  )
}
```
