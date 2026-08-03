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

```sh [<i class="devicon-npm-plain"></i> npm]
npm create gnim@beta
```

```sh [<i class="devicon-pnpm-plain"></i> pnpm]
pnpm create gnim@beta
```

```sh [<i class="devicon-yarn-original"></i> yarn]
yarn create gnim@beta
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
