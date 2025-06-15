# Gnim

Library which brings JSX and reactivity to GNOME JavaScript.

If you are not already familiar with GJS and GObject, you should read
[gjs.guide](https://gjs.guide/) first.

This library provides:

- [JSX and reactivity](https://aylur.github.io/gnim/jsx) for both Gtk
  Applications and Gnome extensions
- [GObject decorators](https://aylur.github.io/gnim/gobject) for a convenient
  and type safe way for subclassing GObjects
- [DBus decorators](https://aylur.github.io/gnim/dbus) for a convenient and type
  safe way for implementing DBus services and proxies.

## Obligatory Counter Example

```tsx
function Counter() {
  const [counter, setCounter] = createState(0)

  function increment() {
    setCounter((v) => v + 1)
  }

  return (
    <Gtk.Box spacing={8}>
      <Gtk.Label label={counter((c) => c.toString())} />
      <Gtk.Button onClicked={increment}>Increment</Gtk.Button>
    </Gtk.Box>
  )
}
```

## Example apps using Gnim

- [icon-theme-browser](https://github.com/Aylur/icon-theme-browser)

## Credits

- [JU12000](https://github.com/JU12000) for suggesting the name Gnim
- [Azazel-Woodwind](https://github.com/Azazel-Woodwind) for a lot of early
  testing
