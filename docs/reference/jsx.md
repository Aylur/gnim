# JSX

Syntactic sugar for creating objects declaratively.

> [!WARNING] This is not React
>
> Gnim shares many concepts with UI rendering libraries like React, Solid, and
> Svelte, but it is its own solution: it is **not React**.

## JSX Element

A valid JSX component must either be a function that returns a `GnimNode` or a
class that inherits from `GObject.Object`.

```ts
type FC = (props: any) => GnimNode
type CC = new (props: any) => GObject.Object

interface ConstructorNode {
  type: string | FC | CC
  props: Record<string, unknown>
}

type GnimNode =
  | ConstructorNode
  | GObject.Object
  | Iterable<GnimNode>
  | Accessor<GnimNode>
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
```

When two object types have a parent-child relationship, they can be composed
naturally using JSX syntax. For example, this applies to types like
`Gtk.EventController`:

```tsx
<Gtk.Box>
  <Gtk.GestureClick onPressed={() => print("clicked")} />
</Gtk.Box>
```

> [!IMPORTANT] Accessor children should be primitive types only
>
> Due to how instantiation order works you should only pass primitive types as
> children using Accessors. If you capture a JSX expression in an Accessor and
> try to pass it as children it will break the scoping mechanism and contexts
> are lost.
>
> ```tsx
> let str: Accessor<string>
>
> function Comp() {
>   return (
>     <Gtk.Button>
>       // [!code --:3]
>       {str((s) => (
>         <Gtk.Label label={s} />
>       ))}
>       // [!code ++]
>       <With value={str}>{(s) => <Gtk.Label label={s} />}</With>
>     </Gtk.Button>
>   )
> }
> ```

## Class Components

When defining custom components, choosing between using classes vs. functions is
mostly down to preference. There are cases when you will have to subclass,
however you will mostly be using class components from libraries such as Gtk,
and defining function components for custom components.

### Constructor function

By default, classes are instantiated with the `new` keyword and initial values
are passed in. In cases where you need to use a static constructor function
instead, you can specify it with `construct`.

```tsx
<Gtk.DropDown
  construct={() => Gtk.DropDown.new_from_strings(["item1", "item2"])}
/>
```

The `construct` property can also be given an existing instance. It can be used
in combination with the `render` function to use JSX in subclasses.

```tsx
@register
class MyWidget extends Gtk.Widget {
  constructor() {
    super()
    render(() => <MyWidget construct={this}>Hello</MyWidget>)
  }
}
```

### Type string

Under the hood, to build the widget tree Gnim uses the
[Gtk.Buildable](https://docs.gtk.org/gtk4/iface.Buildable.html) interface, which
lets you specify a slot to specify the type the `child` is meant to be.

```tsx
<Gtk.CenterBox>
  <Gtk.Box slot="start" />
  <Gtk.Box slot="center" />
  <Gtk.Box slot="end" />
</Gtk.CenterBox>
```

> [!NOTE]
>
> This is specific to Gtk renderers and is unavailable when using Clutter.

### Signal handlers

Signal handlers can be defined with an `on` prefix, and `notify::` signal
handlers can be defined with an `onNotify` prefix.

```tsx
<Gtk.Revealer
  onNotifyChildRevealed={(self) => print(self, "child-revealed")}
  onDestroy={(self) => print(self, "destroyed")}
/>
```

### Ref

It is possible to define an arbitrary function to do something with the instance
imperatively. It is run **after** properties are set, signals are connected, and
children are appended, but **before** the instance is appended to parents.

```tsx
<Gtk.Stack ref={(self) => print(self, "is about to be returned")} />
```

The most common use case is to acquire a reference to the widget in the scope of
the function.

```tsx
function MyWidget() {
  let box: Gtk.Box

  function someHandler() {
    console.log(box)
  }

  return <Gtk.Box ref={(self) => (box = self)} />
}
```

Another common use case is to initialize relations between widgets in the tree.

```tsx
function MyWidget() {
  let win: Gtk.Window
  let searchbar: Gtk.SearchBar

  effect(() => {
    searchbar.set_key_capture_widget(win)
  })

  return (
    <Gtk.Window ref={(self) => (win = self)}>
      <Gtk.SearchBar ref={(self) => (searchbar = self)}>
        <Gtk.SearchEntry />
      </Gtk.SearchBar>
    </Gtk.Window>
  )
}
```

### Bindings

Properties can be set as a static value. Alternatively, they can be passed an
[Accessor](#state-management), in which case whenever its value changes, it will
be reflected on the widget.

```tsx
const [revealed, setRevealed] = createState(false)

return (
  <Gtk.Button onClicked={() => setRevealed((v) => !v)}>
    <Gtk.Revealer revealChild={revealed}>
      <Gtk.Label label="content" />
    </Gtk.Revealer>
  </Gtk.Button>
)
```

### Inline CSS

There is an additional `css` property available on Class components that inherit
from `Gtk.Widget`. It is mostly meant to be used as a debugging tool, e.g. with
`css="border: 1px solid red;"`.

```tsx
<Gtk.Button css="border: 1px solid red;" />
```

### Class names

The `class` property is available on Class components that inherit from
`Gtk.Widget`. It is an alternative to Gtk4 `cssClasses`
<span style="opacity: 0.6">(Gtk3 does not have a property for class
names)</span> property which can take class names in various forms.

```tsx
const name: string | Accessor<string> | string[] | Accessor<string[]>

return (
  <Gtk.Button
    class="class1 class2"
    class={name}
    class={["class1 class2", name]}
  />
)
```

## Function Components

Function components don't have internally managed properties, they are all
handled in user code.

> [!TIP]
>
> In Gnim, props have to be explicitly declared as reactive due to GObjects
> having possible `construct-only` properties that cannot be mutated after
> instantiation.

```tsx
import { prop, MaybeAccessor } from "gnim"

function Counter(props: {
  count?: MaybeAccessor<number>
  onClicked?: () => void
  children?: GnimNode
}) {
  const count = prop(props.count, 0)

  return (
    <Gtk.Button onClicked={props.onClicked}>
      <Gtk.Box>
        <Gtk.Label label={count.as(String)} />
        {props.children}
      </Gtk.Box>
    </Gtk.Button>
  )
}
```

## Control flow

### Dynamic rendering

When you want to render based on a value, you can use the `<With>` component.

```tsx
let value: Accessor<{ member: string } | null>

return (
  <With value={value}>
    {(value) => value && <Gtk.Label label={value.member} />}
  </With>
)
```

> [!TIP]
>
> In a lot of cases it is better to always render the component and set its
> `visible` property instead.
>
> ```tsx
> const member = computed(() => value()?.member || "")
> const shouldShow = computed(() => member() !== "")
>
> return <Label visible={shouldShow} label={member} />
> ```

### List rendering

The `<For>` component lets you render based on an array dynamically. Each time
the array changes, it is compared with its previous state. Widgets for new items
are inserted, while widgets associated with removed items are removed.

```tsx
let list: Accessor<Iterable<T>>

return (
  <For each={list}>
    {(item: T, index: Accessor<number>) => (
      <Gtk.Label label={index((i) => `${i}. ${item}`)} />
    )}
  </For>
)
```

### Fragment

A `<Fragment>` often used via `<>...</>` syntax, lets you group elements without
a wrapper widget.

```tsx
<>
  <FirstChild />
  <SecondChild />
</>
```

### Portal

Renders children into a different mount point in the widget tree, breaking out
of the normal parent-child hierarchy.

Example:

```tsx
<Portal mount={app}>
  <Gtk.Window />
</Portal>
```

## Intrinsic Elements

Intrinsic elements are globally available components, which in web frameworks
are usually HTMLElements such as `<div>` `<span>` `<p>`. There are no intrinsic
elements by default but custom renderers may define them.
