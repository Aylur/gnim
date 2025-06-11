# Gjsx

Library which brings JSX and reactivity to GNOME JavaScript.

If you are not already familiar with GJS and GObject, you should read
[gjs.guide](https://gjs.guide/) first.

This library provides:

- [JSX and reactivity](https://aylur.github.io/gjsx/jsx) for both Gtk
  Applications and Gnome extensions
- [GObject decorators](https://aylur.github.io/gjsx/gobject) for a convenient
  and type safe way for subclassing GObjects
- [DBus decorators](https://aylur.github.io/gjsx/dbus) for a convenient and type
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
            <Gtk.Label label={counter.as((c) => c.toString())} />
            <Gtk.Button $clicked={increment}>Increment</Gtk.Button>
        </Gtk.Box>
    )
}
```

## Example apps using Gjsx

- [icon-theme-browser](https://github.com/Aylur/icon-theme-browser)
