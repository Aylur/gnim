# `@gnim-js/gtk4`

## `render`

Mounts a JSX tree and returns a dispose function that tears it down.

```ts
function render(element: () => GnimNode, root?: GObject.Object): () => void
```

Example:

```tsx
import Gtk from "gi://Gtk?version=4.0"
import { render } from "@gnim-js/gtk4"

let app: Gtk.Application

const dispose = render(
  () => (
    <Gtk.Window visible>
      <Gtk.Label label="Hello" />
    </Gtk.Window>
  ),
  app,
)
```

The renderer also defines the `slot`, `css` and `class` JSX attributes.

### `slot`

Under the hood, to build the widget tree the renderer mostly uses the
[Gtk.Buildable](https://docs.gtk.org/gtk4/iface.Buildable.html) interface. The
`slot` attribute specifies the type the `child` is meant to be.

```tsx
<Gtk.CenterBox>
  <Gtk.Box slot="start" />
  <Gtk.Box slot="center" />
  <Gtk.Box slot="end" />
</Gtk.CenterBox>
```

> [!NOTE]
>
> When a widget has a property for said slot, its possible to pass JSX as that
> property
> <!-- prettier-ignore -->
> ```tsx
> <Gtk.CenterBox
>   start={<Gtk.Box />}
>   center={<Gtk.Box />}
>   end={<Gtk.Box />}
> />
> ```

### `css`

Inline styling on class components that inherit from `Gtk.Widget`.

```tsx
<Gtk.Button css="border: 1px solid red;" />
```

> [!NOTE]
>
> The mechanism used under the hood is deprecated in Gtk. It also does not
> cascade.

Declarations without a selector are wrapped in `* { }`, but a full stylesheet
can be passed as well, for example to target pseudo-classes.

```tsx
<Gtk.Button css="button:hover { color: red; }" />
```

### `class`

Alternative to the Gtk4 `cssClasses` property which can take class names in
various forms.

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
> Passing `cssClasses` or `class` assigns the widget's `css-classes` property,
> which means any class name that a widget might have by default will be
> overwritten. To preserve them, they have to be explicitly specified. Or you
> might want to imperatively append/remove class names instead.
>
> ```tsx
> return <Gtk.Window class={["background", "MyWindow"]} />
>
> return <Gtk.Window ref={(self) => self.add_css_class("MyWindow")} />
> ```

## `getSlot`

Reads back the `slot` attribute that was set on an object in JSX.

```ts
function getSlot(object: GObject.Object): string | null
```

## `createListItemFactory`

Creates a `Gtk.ListItemFactory` for view widgets such as `Gtk.ListView` and
`Gtk.GridView`, letting you declare list items in JSX.

```ts
type Item<T extends GObject.Object> = Gtk.ListItem & {
  item: T | null
}

function createListItemFactory<T extends GObject.Object>(
  factory: (item: Accessor<Item<T> | null>) => GnimNode,
): Gtk.ListItemFactory
```

The factory function receives an `Accessor` of the `Gtk.ListItem`, which is
`null` while the item is not bound to a value.

Example:

```tsx
import Gtk from "gi://Gtk?version=4.0"
import { createListItemFactory } from "@gnim-js/gtk4/listItemFactory"

function StringList() {
  const model = Gtk.StringList.new(["one", "two", "three"])

  return (
    <Gtk.ListView
      model={Gtk.NoSelection.new(model)}
      factory={createListItemFactory<Gtk.StringObject>((listItem) => (
        <Gtk.Label label={listItem.as((li) => li?.item?.string ?? "")} />
      ))}
    />
  )
}
```

> [!NOTE]
>
> `createListItemFactory` captures the current reactive scope, so it has to be
> called from inside one, for example in the body of a function component.

## `style` and `keyframes`

> [!WARNING]
>
> `style` and `keyframes` are experimental.

CSS-in-JS: takes an object of
[Gtk CSS properties](https://docs.gtk.org/gtk4/css-properties.html) and returns
a generated class name. Nested selectors are supported with the `&` prefix and
media queries with `@media` keys.

```ts
function style(props: Style): string
function style(producer: () => Style): Accessor<string>
```

Defines a CSS `@keyframes` animation and returns its generated name. Keys are
either `from`/`to` or percentages.

```ts
type Keyframes =
  | { from: CssProperties; to: CssProperties }
  | { [percentage: number]: CssProperties }

function keyframes(keyframes: Keyframes): string
function keyframes(keyframes: () => Keyframes): Accessor<string>
```

Example:

```tsx
import { keyframes, style } from "@gnim-js/gtk4"

const spin = keyframes({
  from: { transform: "rotate(0turn)" },
  to: { transform: "rotate(1turn)" },
})

const className = style({
  animation: `${spin} 1s linear infinite`,
})

return <Gtk.Label class={className} label="styled" />
```
