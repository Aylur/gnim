# GObject

Before jumping into Gtk, you have to understand a few concepts about
`GObject.Object` which is the base type everything inherits from.

## GObject Construction

::: tip

In rare cases, like the `Gio.File` interface, objects can not be constructed
with the `new` operator and a constructor method must always be used.

:::

The most common way to create a GObject instance is using the `new` operator.
When constructing a GObject this way, you can pass a dictionary of properties:

```ts
const labelWidget = new Gtk.Label({
  label: "<b>Text</b>",
  useMarkup: true,
})
```

Many classes also have static constructor methods you can use directly:

```ts
const labelWidget = Gtk.Label.new("Text")
```

## Signals

GObjects support a signaling system, similar to events and EventListeners in the
JavaScript Web API. Here we will cover the basics of connecting and
disconnecting signals, as well as using callbacks.

### Connecting Signals

Signals are connected by calling `GObject.Object.prototype.connect()`, which
returns a handler ID. Signals are disconnected by passing that ID to
`GObject.Object.prototype.disconnect()`:

```ts
const button = new Gtk.Button({ label: "Lorem Ipsum" })

// Connecting a signal
const handlerId = button.connect("clicked", () => {
  console.log("Button clicked!")
})

// Disconnecting a signal
button.disconnect(handlerId)
```

### Callback Arguments

Signals often have multiple callback arguments, but the first is always the
emitting object:

```ts
const selectLabel = Gtk.Label.new("")

selectLabel.connect("move-cursor", (label, step, count, extendSelection) => {
  if (label === selectLabel) {
    console.log("selectLabel emitted the signal!")
  }

  if (step === Gtk.MovementStep.WORDS) {
    console.log(`The cursor was moved ${count} word(s)`)
  }

  if (extendSelection) {
    console.log("The selection was extended")
  }
})
```

### Callback Return Values

::: warning

A callback with no return value will implicitly return `undefined`, while an
`async` function will implicitly return a `Promise`.

:::

Some signals expect a return value, usually a `boolean`. The type and behavior
of the return value will be described in the documentation for the signal.

```ts
const linkLabel = new Gtk.Label({
  label: '<a href="https://www.gnome.org">GNOME</a>',
  use_markup: true,
})

linkLabel.connect("activate-link", (label, uri) => {
  if (uri.startsWith("file://")) {
    console.log(`Ignoring ${uri}`)
    return true
  }

  return false
})
```

Using an `async` function as a signal handler will return an implicit `Promise`,
which will be coerced to a _truthy_ value. If necessary, use a traditional
`Promise` chain and return the expected value type explicitly.

```ts
linkLabel.connect("activate-link", (label, uri) => {
  // Do something asynchronous with the signal arguments
  Promise.resolve(uri).catch(console.error)

  return true
})
```

## Properties

GObject supports a property system that is slightly more powerful than native
JavaScript properties.

### Accessing Properties

GObject properties may be retrieved and set using native property style access
or GObject get and set methods.

```ts
const invisibleLabel = new Gtk.Label({
  visible: false,
})
let visible

// Three different ways to get or set properties
visible = invisibleLabel.visible
visible = invisibleLabel["visible"]
visible = invisibleLabel.get_visible()

invisibleLabel.visible = false
invisibleLabel["visible"] = false
invisibleLabel.set_visible(false)
```

GObject property names have a canonical form that is `kebab-cased`, however they
are accessed differently depending on the situation:

```ts
const markupLabel = new Gtk.Label({
  label: "<i>Italics</i>",
  use_markup: true,
})
let useMarkup

// If using native accessors, you can use `underscore_case` or `camelCase`
useMarkup = markupLabel.use_markup
useMarkup = markupLabel.useMarkup

// Anywhere the property name is a string, you must use `kebab-case`
markupLabel["use-markup"] = true
markupLabel.connect("notify::use-markup", () => {})

// Getter and setter functions are always case sensitive
useMarkup = markupLabel.get_use_markup()
markupLabel.set_use_markup(true)
```

### Property Change Notification

Most GObject properties will emit
[`GObject.Object::notify`](https://gjs-docs.gnome.org/gobject20/gobject.object#signals-notify)
signal when the value is changed. You can connect to this signal in the form of
`notify::property-name` to invoke a callback when it changes:

```ts
const changingLabel = Gtk.Label.new("Original Label")

const labelId = changingLabel.connect("notify::label", (object, _pspec) => {
  console.log(`New label is "${object.label}"`)
})
```
