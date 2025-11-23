# JSX

Syntactic sugar for creating objects declaratively.

> [!WARNING] This is not React
>
> This works nothing like React and has nothing in common with React other than
> the XML syntax.

Consider the following example:

```ts
function Box() {
  let counter = 0

  const button = new Gtk.Button()
  const icon = new Gtk.Image({
    iconName: "system-search-symbolic",
  })
  const label = new Gtk.Label({
    label: `clicked ${counter} times`,
  })
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
  })

  function onClicked() {
    label.label = `clicked ${counter} times`
  }

  button.set_child(icon)
  box.append(button)
  box.append(label)
  button.connect("clicked", onClicked)
  return box
}
```

Can be written as

```tsx
function Box() {
  const [counter, setCounter] = createState(0)
  const label = createComputed(() => `clicked ${counter()} times`)

  function onClicked() {
    setCounter((c) => c + 1)
  }

  return (
    <Gtk.Box orientation={Gtk.Orientation.VERTICAL}>
      <Gtk.Button onClicked={onClicked}>
        <Gtk.Image iconName="system-search-symbolic" />
      </Gtk.Button>
      <Gtk.Label label={label} />
    </Gtk.Box>
  )
}
```

## JSX expressions and `jsx` function

A JSX expression transpiles to a `jsx` function call. A JSX expression's type
however is **always** the base `GObject.Object` type, while the `jsx` return
type is the instance type of the class or the return type of the function you
pass to it. If you need the actual type of an object, either use the `jsx`
function directly or type assert the JSX expression.

```tsx
import { jsx } from "gnim"

const menubutton = new Gtk.MenuButton()

menubutton.popover = <Gtk.Popover /> // cannot assign Object to Popover // [!code error]
menubutton.popover = jsx(Gtk.Popover, {}) // works as expected

function MyPopover(): Gtk.Popover
menubutton.popover = <MyPopover /> // cannot assign Object to Popover // [!code error]
menubutton.popover = jsx(MyPopover, {}) // works as expected
```

## JSX Element

A valid JSX component must either be a function that returns a `GObject.Object`
instance, or a class that inherits from `GObject.Object`.

> [!TIP]
>
> `JSX.Element` is simply an alias for `GObject.Object`.

When two types have a parent-child relationship, they can be composed naturally
using JSX syntax. For example, this applies to types like `Gtk.EventController`:

```tsx
<Gtk.Box>
  <Gtk.GestureClick onPressed={() => print("clicked")} />
</Gtk.Box>
```

## Class components

When defining custom components, choosing between using classes vs. functions is
mostly down to preference. There are cases when one or the other is more
convenient to use, but you will mostly be using class components from libraries
such as Gtk, and defining function components for custom components.

Using classes in JSX expressions lets you set some additional properties.

### Constructor function

By default, classes are instantiated with the `new` keyword and initial values
are passed in. In cases where you need to use a static constructor function
instead, you can specify it with `$constructor`.

> [!WARNING]
>
> Initial values this way cannot be passed to the constructor and are set
> **after** construction. This means construct-only properties like `css-name`
> cannot be set.

```tsx
<Gtk.DropDown
  $constructor={() => Gtk.DropDown.new_from_strings(["item1", "item2"])}
/>
```

### Type string

Under the hood, the `jsx` function uses the
[Gtk.Buildable](https://docs.gtk.org/gtk4/iface.Buildable.html) interface, which
lets you use a type string to specify the type the `child` is meant to be.

> [!NOTE] In Gnome extensions, it has no effect.

```tsx
<Gtk.CenterBox>
  <Gtk.Box $type="start" />
  <Gtk.Box $type="center" />
  <Gtk.Box $type="end" />
</Gtk.CenterBox>
```

### Signal handlers

Signal handlers can be defined with an `on` prefix, and `notify::` signal
handlers can be defined with an `onNotify` prefix.

```tsx
<Gtk.Revealer
  onNotifyChildRevealed={(self) => print(self, "child-revealed")}
  onDestroy={(self) => print(self, "destroyed")}
/>
```

### Setup function

It is possible to define an arbitrary function to do something with the instance
imperatively. It is run **after** properties are set, signals are connected, and
children are appended, but **before** the `jsx` function returns.

```tsx
<Gtk.Stack $={(self) => print(self, "is about to be returned")} />
```

The most common use case is to acquire a reference to the widget in the scope of
the function.

```tsx
function MyWidget() {
  let box: Gtk.Box

  function someHandler() {
    console.log(box)
  }

  return <Gtk.Box $={(self) => (box = self)} />
}
```

Another common use case is to initialize relations between widgets in the tree.

```tsx
function MyWidget() {
  let searchbar: Gtk.SearchBar

  function init(win: Gtk.Window) {
    searchbar.set_key_capture_widget(win)
  }

  return (
    <Gtk.Window $={init}>
      <Gtk.SearchBar $={(self) => (searchbar = self)}>
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

### How children are passed to class components

Class components can only take `GObject.Object` instances as children. They are
set through
[`Gtk.Buildable.add_child`](https://docs.gtk.org/gtk4/iface.Buildable.html).

> [!NOTE]
>
> In Gnome extensions, they are set with `Clutter.Actor.add_child`.

```ts
@register({ Implements: [Gtk.Buildable] })
class MyContainer extends Gtk.Widget {
  vfunc_add_child(
    builder: Gtk.Builder,
    child: GObject.Object,
    type?: string | null,
  ): void {
    if (child instanceof Gtk.Widget) {
      // set children here
    } else {
      super.vfunc_add_child(builder, child, type)
    }
  }
}
```

### Class names and inline CSS

JSX supports setting `class` and `css` properties. `css` is mostly meant to be
used as a debugging tool, e.g. with `css="border: 1px solid red;"`. `class` is a
space-separated list of class names.

```tsx
<Gtk.Button class="flat" css="border: 1px solid red;" />
```

> [!NOTE]
>
> Besides `class`, you can also use `css-classes` in Gtk4 and `style-class` in
> Gnome.

### This component

In most cases, you will use JSX to instantiate objects. However, there are cases
when you have a reference to an instance that you would like to use in a JSX
expression, for example, in subclasses.

```tsx
@register()
class Row extends Gtk.ListBoxRow {
  constructor(props: Partial<Gtk.ListBoxRow.ConstructorProps>) {
    super(props)

    void (
      <This this={this as Row} onActivate={() => print("activated")}>
        <Gtk.Label label="content" />
      </This>
    )
  }
}
```

## Function components

### Setup function

Just like class components, function components can also have a setup function.

```tsx
import { FCProps } from "gnim"

type MyComponentProps = FCProps<
  Gtk.Button,
  {
    prop?: string
  }
>

function MyComponent({ prop }: MyComponentProps) {
  return <Gtk.Button label={prop} />
}

return <MyComponent $={(self) => print(self, "is a Button")} prop="hello" />
```

> [!NOTE]
>
> `FCProps` is required for TypeScript to be aware of the `$` prop.

### How children are passed to function components

They are passed in through the `children` property. They can be of any type.

```tsx
interface MyButtonProps {
  children: string
}

function MyButton({ children }: MyButtonProps) {
  return <Gtk.Button label={children} />
}

return <MyButton>Click Me</MyButton>
```

When multiple children are passed in, `children` is an `Array`.

```tsx
interface MyBoxProps {
  children: Array<GObject.Object | string>
}

function MyBox({ children }: MyBoxProps) {
  return (
    <Gtk.Box>
      {children.map((item) =>
        item instanceof Gtk.Widget ? (
          item
        ) : (
          <Gtk.Label label={item.toString()} />
        ),
      )}
    </Gtk.Box>
  )
}

return (
  <MyBox>
    Some Content
    <Gtk.Button />
  </MyBox>
)
```

### Everything has to be handled explicitly in function components

There is no builtin way to define signal handlers or bindings automatically.
With function components, they have to be explicitly declared and handled.

```tsx
interface MyWidgetProps {
  label: Accessor<string> | string
  onClicked: (self: Gtk.Button) => void
}

function MyWidget({ label, onClicked }: MyWidgetProps) {
  return <Gtk.Button onClicked={onClicked} label={label} />
}
```

> [!TIP]
>
> To make reusable function components more convenient to use, you should
> annotate props as either static or dynamic and handle both cases as if it was
> dynamic.
>
> ```ts
> type $<T> = T | Accessor<T>
> const $ = <T>(value: $<T>): Accessor<T> =>
>   value instanceof Accessor ? value : new Accessor(() => value)
> ```

```tsx
function Counter(props: {
  count?: $<number>
  label?: $<string>
  onClicked?: () => void
}) {
  const count = $(props.count)((v) => v ?? 0)
  const label = $(props.label)((v) => v ?? `Fallback label ${count()}`)

  return <Gtk.Button label={label} onClicked={props.onClicked} />
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
> In a lot of cases, it is better to always render the component and set its
> `visible` property instead.

> [!WARNING]
>
> When the value changes and the widget is re-rendered, the previous one is
> removed from the parent component and the new one is **appended**. The order
> of widgets is not kept, so make sure to wrap `<With>` in a container to avoid
> this.

### List rendering

The `<For>` component lets you render based on an array dynamically. Each time
the array changes, it is compared with its previous state. Widgets for new items
are inserted, while widgets associated with removed items are removed.

```tsx
let list: Accessor<Iterable<any>>

return (
  <For each={list}>
    {(item, index: Accessor<number>) => (
      <Gtk.Label label={index((i) => `${i}. ${item}`)} />
    )}
  </For>
)
```

> [!WARNING]
>
> Similarly to `<With>`, when the list changes and a new item is added, it is
> simply **appended** to the parent. The order of widgets is not kept, so make
> sure to wrap `<For>` in a container to avoid this.

### Fragments

Both `<When>` and `<For>` are `Fragment`s. A `Fragment` is a collection of
children. Whenever the children array changes, it is reflected on the parent
widget the `Fragment` was assigned to. When implementing custom widgets, you
need to take into consideration the API being used for child insertion and
removing.

- Both Gtk3 and Gtk4 uses the `Gtk.Buildable` interface to append children.
- Gtk3 uses the `Gtk.Container` interface to remove children.
- Gtk4 checks for a method called `remove`.
- Clutter uses `Clutter.Actor.add_child` and `Clutter.Actor.remove_child`.

## State management

There is a single primitive called `Accessor`, which is a read-only reactive
value. It is the base of Gnim's reactive system. They are essentially functions
that let you read a value and track it in reactive scopes so that when they
change the reader is notified.

```ts
interface Accessor<T> {
  (): T
  peek(): T
  subscribe(callback: Callback): DisposeFn
}
```

There are two ways to read the current value:

- `(): T`: which returns the current value and tracks it as a dependency in
  reactive scopes
- `peek(): T` which returns the current value **without** tracking it as a
  dependency

To subscribe for value changes you can use the `subscribe` method.

```ts
const accessor: Accessor<any>

const unsubscribe = accessor.subscribe(() => {
  console.log("value of accessor changed to", accessor.get())
})

unsubscribe()
```

> [!WARNING]
>
> The subscribe method is not scope aware. Do not forget to clean them up when
> no longer needed. Alternatively, use an [`effect`](#createeffect) instead.

### `createState`

Creates a writable reactive value.

```ts
function createState<T>(init: T): [Accessor<T>, Setter<T>]
```

Example:

```ts
const [value, setValue] = createState(0)

// setting its value
setValue(2)
setValue((prev) => prev + 1)
```

> [!IMPORTANT]
>
> Effects and computations are only triggered when the value changes.

By default, equality between the previous and new value is checked with
[Object.is](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is)
and so this would not trigger an update:

```ts
const [object, setObject] = createState({})

// this does NOT trigger an update by default
setObject((obj) => {
  obj.field = "mutated"
  return obj
})
```

You can pass in a custom `equals` function to customize this behavior:

```ts
const [value, setValue] = createState("initial value", {
  equals: (prev, next): boolean => {
    return prev != next
  },
})
```

### `createComputed`

Create a computed value which tracks dependencies and invalidates the value
whenever they change. The result is cached and is only computed on access.

```ts
function createComputed<T>(compute: () => T): Accessor<T>
```

Example:

```ts
let a: Accessor<number>
let b: Accessor<number>

const c: Accessor<number> = createComputed(() => a() + b())
```

> [!TIP]
>
> There is a shorthand for computed values.
>
> ```ts
> let a: Accessor<string>
> const b = createComputed(() => `transformed ${a()}`)
> const b = a((v) => `transformed ${v}`) // alias for the above line
> ```

### `createBinding`

Creates an `Accessor` on a `GObject.Object`'s `property`.

```ts
function createBinding<T extends GObject.Object, P extends keyof T>(
  object: T,
  property: Extract<P, string>,
): Accessor<T[P]>
```

Example:

```ts
const styleManager = Adw.StyleManager.get_default()
const style = createBinding(styleManager, "colorScheme")
```

It also supports nested bindings.

```ts
interface Outer extends GObject.Object {
  nested: Inner | null
}

interface Inner extends GObject.Object {
  field: string
}

const value: Accessor<string | null> = createBinding(outer, "nested", "field")
```

### `createEffect`

Schedule a function to run after the current Scope created with
[`createRoot`](#createroot) returns, tracking dependencies and re-running the
function whenever they change.

```ts
function createEffect(fn: () => void): void
```

Example:

```ts
const count: Accessor<number>

createEffect(() => {
  console.log(count()) // reruns whenever count changes
})

createEffect(() => {
  console.log(count.peek()) // only runs once
})
```

> [!CAUTION]
>
> Effects are a common pitfall for beginners to understand when to use and when
> not to use them. You can read about
> [when it is discouraged and their alternatives](./tutorial/gnim.md#when-not-to-use-an-effect).

### `createConnection`

```ts
function createConnection<
  T,
  O extends GObject.Object,
  S extends keyof O["$signals"],
>(
  init: T,
  handler: [
    object: O,
    signal: S,
    callback: (
      ...args: [...Parameters<O["$signals"][S]>, currentValue: T]
    ) => T,
  ],
): Accessor<T>
```

Creates an `Accessor` which sets up a list of `GObject.Object` signal
connections. It expects an initial value and a list of
`[object, signal, callback]` tuples where the callback is called with the
arguments passed by the signal and the current value as the last parameter.

Example:

```ts
const value: Accessor<string> = createConnection(
  "initial value",
  [obj1, "notify", (pspec, currentValue) => currentValue + pspec.name],
  [obj2, "sig-name", (sigArg1, sigArg2, currentValue) => "str"],
)
```

> [!IMPORTANT]
>
> The connection will only get attached when the first subscriber appears, and
> is dropped when the last one disappears.

### `createMemo`

Create a derived reactive value which tracks its dependencies and re-runs the
computation whenever a dependency changes. The resulting `Accessor` will only
notify subscribers when the computed value has changed.

```ts
function createMemo<T>(compute: () => T): Accessor<T>
```

It is useful to memoize values that are dependencies of expensive computations.

Example:

```ts
const value = createBinding(gobject, "field")

createEffect(() => {
  console.log("effect1", value())
})

const memoValue = createMemo(() => value())

createEffect(() => {
  console.log("effect2", memoValue())
})

value.notify("field") // triggers effect1 but not effect2
```

### `createSettings`

Wraps a `Gio.Settings` into a collection of setters and accessors.

```ts
function createSettings<const T extends Record<string, string>>(
  settings: Gio.Settings,
  keys: T,
): Settings<T>
```

Example:

```ts
const s = createSettings(settings, {
  "complex-key": "a{sa{ss}}",
  "simple-key": "s",
})

s.complexKey.subscribe(() => {
  print(s.complexKey.get())
})

s.setComplexKey((prev) => ({
  ...prev,
  neyKey: { nested: "" },
}))
```

### `createExternal`

Creates a signal from a `provider` function. The provider is called when the
first subscriber appears. The returned dispose function from the provider will
be called when the number of subscribers drops to zero.

```ts
function createExternal<T>(
  init: T,
  producer: (set: Setter<T>) => DisposeFunction,
): Accessor<T>
```

Example:

```ts
const counter = createExternal(0, (set) => {
  const interval = setInterval(() => set((v) => v + 1))
  return () => clearInterval(interval)
})
```

## Scopes and Life cycle

A [scope](./tutorial/gnim.md#scopes) is essentially a global object which holds
cleanup functions and context values.

```js
let scope = new Scope()

// Inside this function, synchronously executed code will have access
// to `scope` and will attach any allocated resources, such as signal
// subscriptions.
scopedFuntion()

// At a later point it can be disposed.
scope.dispose()
```

### `createRoot`

```ts
function createRoot<T>(fn: (dispose: () => void) => T)
```

Creates a root scope. Other than wrapping the main entry function in this, you
likely won't need this elsewhere. `<For>` and `<With>` components run their
children in their own scopes, for example.

Example:

```tsx
createRoot((dipose) => {
  return <Gtk.Window onCloseRequest={dispose}></Gtk.Window>
})
```

### `getScope`

Gets the current scope. You might need to reference the scope in cases where
async functions need to run in the scope.

Example:

```ts
const scope = getScope()
setTimeout(() => {
  // This callback gets run without an owner scope.
  // Restore owner via scope.run:
  scope.run(() => {
    const foo = FooContext.use()
    onCleanup(() => {
      print("some cleanup")
    })
  })
}, 1000)
```

### `onCleanup`

Attaches a cleanup function to the current scope.

Example:

```tsx
function MyComponent() {
  const dispose = signal.subscribe(() => {})

  onCleanup(() => {
    dispose()
  })

  return <></>
}
```

### `onMount`

Attaches a function to run when the farthest non-mounted scope returns.

Example:

```tsx
function MyComponent() {
  onMount(() => {
    console.log("root scope returned")
  })

  return <></>
}
```

### Contexts

Context provides a form of dependency injection. It lets you avoid the need to
pass data as props through intermediate components (a.k.a. prop drilling). The
default value is used when no Provider is found above in the hierarchy.

Example:

```tsx
const MyContext = createContext("fallback-value")

function ConsumerComponent() {
  const value = MyContext.use()

  return <Gtk.Label label={value} />
}

function ProviderComponent() {
  return (
    <Gtk.Box>
      <MyContext value="my-value">{() => <ConsumerComponent />}</MyContext>
    </Gtk.Box>
  )
}
```

## Intrinsic Elements

Intrinsic elements are globally available components, which in web frameworks
are usually HTMLElements such as `<div>` `<span>` `<p>`. There are no intrinsic
elements by default, but they can be set.

> [!TIP]
>
> It should always be preferred to use function/class components directly.

- Function components

  ```tsx
  import { FCProps } from "gnim"
  import { intrinsicElements } from "gnim/gtk4/jsx-runtime"

  type MyLabelProps = FCProps<
    Gtk.Label,
    {
      someProp: string
    }
  >

  function MyLabel({ someProp }: MyLabelProps) {
    return <Gtk.Label label={someProp} />
  }

  intrinsicElements["my-label"] = MyLabel

  declare global {
    namespace JSX {
      interface IntrinsicElements {
        "my-label": MyLabelProps
      }
    }
  }

  return <my-label someProp="hello" />
  ```

- Class components

  ```tsx
  import { CCProps } from "gnim"
  import { intrinsicElements } from "gnim/gtk4/jsx-runtime"
  import { property, register } from "gnim/gobject"

  interface MyWidgetProps extends Gtk.Widget.ConstructorProps {
    someProp: string
  }

  @register()
  class MyWidget extends Gtk.Widget {
    @property(String) someProp = ""

    constructor(props: Partial<MyWidgetProps>) {
      super(props)
    }
  }

  intrinsicElements["my-widget"] = MyWidget

  declare global {
    namespace JSX {
      interface IntrinsicElements {
        "my-widget": CCProps<MyWidget, MyWidgetProps>
      }
    }
  }

  return <my-widget someProp="hello" />
  ```
