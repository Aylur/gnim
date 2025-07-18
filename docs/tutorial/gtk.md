# Gtk

This page is merely an intro to Gtk and not a comprehensive guide. For more
in-depth concepts you can read the [Gtk docs](https://docs.gtk.org/gtk4/#extra).

## Running Gtk

To run Gtk you will have to initialize it, create widgets and run a GLib main
loop.

```ts
import GLib from "gi://GLib"
import Gtk from "gi://Gtk?version=4.0"

Gtk.init()

const loop = GLib.MainLoop.new(null, false)

// create widgets here

loop.runAsync()
```

## Your first widget

For a list of available widgets you can refer to the
[Gtk docs](https://docs.gtk.org/gtk4/visual_index.html). If you are planning to
write an app for the Gnome platform you might be interested in using
[Adwaita](https://gnome.pages.gitlab.gnome.org/libadwaita/doc/).

The top level widget that makes it possible to display something on the screen
is `Gtk.Window` and its various subclasses such as `Gtk.ApplicationWindow` and
`Adw.Window`.

```ts
const win = new Gtk.Window({
  defaultWidth: 300,
  defaultHeight: 200,
  title: "My App",
})

const titlebar = new Gtk.HeaderBar()

const label = new Gtk.Label({
  label: "Hello World",
})

win.set_titlebar(titlebar)
win.set_child(label)

win.connect("close-request", () => loop.quit())

win.present()
```

## Layout system

Gtk uses [LayoutManagers](https://docs.gtk.org/gtk4/class.LayoutManager.html) to
decide how a widget positions its children. You will only directly interact with
layout managers when implementing a custom widget. Gtk provides widgets that
implement some common layouts:

- [`Box`](https://docs.gtk.org/gtk4/class.Box.html) which positions its children
  in a horizontal/vertical row.

  ```ts
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.HORIZONTAL,
  })

  box.append(Gtk.Label.new("1"))
  box.append(Gtk.Label.new("2"))
  ```

- [`CenterBox`](https://docs.gtk.org/gtk4/class.CenterBox.html) which positions
  its children in three separate sections similar to `Box`

  ```ts
  const centerBox = new Gtk.CenterBox({
    orientation: Gtk.Orientation.HORIZONTAL,
  })

  centerBox.set_start_widget(Gtk.Label.new("start"))
  centerBox.set_center_widget(Gtk.Label.new("center"))
  centerBox.set_end_widget(Gtk.Label.new("end"))
  ```

- [`Overlay`](https://docs.gtk.org/gtk4/class.Overlay.html) which has a single
  child that dictates the size of the widget and positions each children on top.

  ```ts
  const overlay = new Gtk.Overlay()

  overlay.set_child(Gtk.Label.new("main child"))
  overlay.add_overlay(Gtk.Label.new("overlay"))
  ```

- [`Grid`](https://docs.gtk.org/gtk4/class.Grid.html) which positions its
  children in a table layout.

  ```ts
  const grid = new Gtk.Grid()

  grid.attach(Gtk.Label.new("0x0"), 0, 0, 1, 1)
  grid.attach(Gtk.Label.new("0x1"), 0, 1, 1, 1)
  ```

- [`Stack`](https://docs.gtk.org/gtk4/class.Stack.html) which displays only one
  of its children at once and lets you animate between them.

  ```ts
  const stack = new Gtk.Stack()

  stack.add_named(Gtk.Label.new("1"), "1")
  stack.add_named(Gtk.Label.new("2"), "2")

  stack.set_visible_child_name("2")
  ```

- [`ScrolledWindow`](https://docs.gtk.org/gtk4/class.ScrolledWindow.html)
  displays a single child in a viewport and adds scrollbars so that the whole
  widget can be displayed.

## Events

Gtk uses event controllers that you can assign to widgets that handle user
input. You can read more about event controllers on
[Gtk docs](https://docs.gtk.org/gtk4/input-handling.html#event-controllers-and-gestures).

Some common controllers:

- [EventControllerFocus](https://docs.gtk.org/gtk4/class.EventControllerFocus.html)
- [EventControllerKey](https://docs.gtk.org/gtk4/class.EventControllerKey.html)
- [EventControllerMotion](https://docs.gtk.org/gtk4/class.EventControllerMotion.html)
- [EventControllerScroll](https://docs.gtk.org/gtk4/class.EventControllerScroll.html)
- [GestureClick](https://docs.gtk.org/gtk4/class.GestureClick.html)
- [GestureDrag](https://docs.gtk.org/gtk4/class.GestureDrag.html)
- [GestureSwipe](https://docs.gtk.org/gtk4/class.GestureDrag.html)

```ts
let widget: Gtk.Widget

const gestureClick = new Gtk.GestureClick({
  propagationPhase: Gtk.PropagationPhase.BUBBLE,
})

gestureClick.connect("pressed", () => {
  console.log("clicked")
  return true
})

widget.add_controller(gestureClick)
```

Gtk provides widgets for various forms of user input so you might not need an
event controller.

- [`Button`](https://docs.gtk.org/gtk4/class.Button.html)
- [`Switch`](https://docs.gtk.org/gtk4/class.Switch.html)
- [`Scale`](https://docs.gtk.org/gtk4/class.Scale.html)
- [`Entry`](https://docs.gtk.org/gtk4/class.Entry.html)
