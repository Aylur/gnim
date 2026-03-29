# Gnim

Library that brings JSX, reactivity and type-safety to GNOME JavaScript.

- [TypeScript support](/reference/typescript) for generating GObject
  Introspection type annotations
- [JSX and reactivity](/reference/jsx) for both Gtk Applications and Gnome
  extensions
- [GObject decorators](/reference/gobject) for a convenient way for subclassing
  GObjects
- [DBus decorators](/reference/dbus) for implementing DBus services and
  proxies

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
      <Gtk.Label label={count((c) => c.toString())} />
      <Gtk.Button onClicked={increment}>Increment</Gtk.Button>
    </Gtk.Box>
  )
}
```

## Templates

- [gnome-extension](https://github.com/Aylur/gnome-shell-extension-template/)
- [gtk4](https://github.com/Aylur/gnim-gtk4-template/)
