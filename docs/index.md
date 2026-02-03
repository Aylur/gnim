# Gnim

Library which brings type-safety, JSX and reactivity to GNOME JavaScript.

- [TypeScript support](/typescript) for generating GObject Introspection type
  annotations
- [JSX and reactivity](/jsx) for both Gtk Applications and Gnome extensions
- [GObject decorators](/gobject) for a convenient way for subclassing GObjects
- [DBus decorators](/dbus) for a implementing DBus services and proxies

## Obligatory Counter Example

```tsx
function Counter() {
  const [count, setCount] = createState(0)

  function increment() {
    setCount((v) => v + 1)
  }

  createEffect(() => {
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
