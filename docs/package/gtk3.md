# `@gnim-js/gtk3`

## `render`

Mounts a JSX tree and returns a dispose function that tears it down.

```ts
function render(element: () => GnimNode, root?: GObject.Object): () => void
```

Example:

```tsx
import Gtk from "gi://Gtk?version=3.0"
import { render } from "@gnim-js/gtk3"

let app: Gtk.Application

const dispose = render(
  () => (
    <Gtk.Window>
      <Gtk.Label label="Hello" />
    </Gtk.Window>
  ),
  app,
)
```

> [!NOTE]
>
> In Gtk3 widgets are hidden until they are shown explicitly. To make writing
> JSX less verbose, every widget constructed by the renderer gets
> `visible: true` by default. Pass `visible={false}` to keep a widget hidden.

The renderer also defines the `slot`, `css` and `class` JSX attributes.

### `slot`

Under the hood, to build the widget tree the renderer mostly uses the
[Gtk.Buildable](https://docs.gtk.org/gtk3/iface.Buildable.html) interface. The
`slot` attribute specifies the type the `child` is meant to be.

```tsx
<Gtk.Window>
  <Gtk.HeaderBar slot="titlebar" />
  <Gtk.Box />
</Gtk.Window>
```

### `css`

Inline styling on class components that inherit from `Gtk.Widget`.

```tsx
<Gtk.Button css="border: 1px solid red;" />
```

> [!IMPORTANT]
>
> Prefer using `class` names. `css` attaches a new `Gtk.CssProvider` to the
> widget's style context which does not cascade.

Declarations without a selector are wrapped in `* { }`, but a full stylesheet
can be passed as well, for example to target pseudo-classes.

```tsx
<Gtk.Button css="button:hover { color: red; }" />
```

> [!NOTE]
>
> The provider only applies to the widget itself, its styles do not cascade to
> its children.

### `class`

Sets the style classes of a widget.

```tsx
const name: MaybeAccessor<string | string[]>

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
> Passing `class` removes every class from the widget's style context, which
> means any class name that a widget might have by default will be overwritten.
> To preserve them, they have to be explicitly specified. Or you might want to
> imperatively add/remove class names instead.
>
> ```tsx
> return <Gtk.Window class={["background", "MyWindow"]} />
>
> return (
>   <Gtk.Window
>     ref={(self) => self.get_style_context().add_class("MyWindow")}
>   />
> )
> ```

## `getSlot`

Reads back the `slot` attribute that was set on an object in JSX.

```ts
function getSlot(object: GObject.Object): string | null
```
