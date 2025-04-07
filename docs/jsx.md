# JSX

Syntactic sugar for creating objects declaratively.
In GJS building UIs connecting signals,
binding properties between objects is done mostly imperatively.

> [!WARNING]
> This is not React.js
> This works nothing like React.js and has nothing in common with React.js
> other than the XML syntax.

Consider the following example:

```ts
function Box() {
    const button = new Gtk.Button()
    const icon = new Gtk.Image({
        iconName: "system-search-symbolic",
    })
    const label = new Gtk.Label({ label: "hello world" })
    const box = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
    })

    button.set_child(icon)
    box.append(button)
    box.append(label)

    button.connect("clicked", () => console.log("clicked"))
    return box
}
```

Can be written as

```tsx
function Box() {
    return (
        <Gtk.Box orientation={Gtk.Orientation.VERTICAL}>
            <Gtk.Button $clicked={() => console.log("clicked")}>
                <Gtk.Image iconName="system-search-symbolic" />
            </Gtk.Button>
            <Gtk.Label label="hello world" />
        </Gtk.Box>
    )
}
```

## JSX expressions and `jsx` function

A JSX expression transpiles to a `jsx` function call. A JSX expression's type
however is **always** the base `GObject.Object` type while the `jsx` return
type is the instance type of the class or the return type of the function you
pass to it. If you need the actual type of an object either use the `jsx`
function directly or type assert the JSX expression.

```tsx
import { jsx } from "gjsx/gtk4"

const menubutton = new Gtk.MenuButton()

menubutton.popover = <Gtk.Popover /> // can not assign Object to Popover // [!code error]
menubutton.popover = jsx(Gtk.Popover, {}) // works as expected

function MyPopover(): Gtk.Popover
menubutton.popover = <MyPopover /> // can not assign Object to Popover // [!code error]
menubutton.popover = jsx(MyPopover, {}) // works as expected
```

## Class components

When defining custom components choosing between
using classes vs functions is mostly down to preference.
There are cases when one or the other is more convenient to use, but you are
mostly be using class components that come from libraries such as Gtk and you
will be defining function components for custom components.

Using classes in JSX expressions let's you define some additional properties.

### Constructor function

By default classes are instantiated with the `new` keyword and initial values
are passed in. In cases where you need to use a static constructor function instead
you can define it with `_constructor`.

> [!WARNING]
> Initial values this way can not be passed to the constructor and are set
> **after**. This means construct only properties like `css-name` can not be set.

```tsx
<Gtk.DropDown
    _constructor={() => Gtk.DropDown.new_from_strings(["item1", "item2"])}
/>
```

### Type string

Under the hood the `jsx` function uses the [Gtk.Buildable](https://docs.gtk.org/gtk4/iface.Buildable.html) interface which lets you define a type string to specify the type of `child` it is meant to be.

> [!NOTE]
> When using Gjsx with Gnome extensions, this has no effect.

```tsx
<Gtk.CenterBox>
    <Gtk.Box _type="start" />
    <Gtk.Box _type="center" />
    <Gtk.Box _type="end" />
</Gtk.CenterBox>
```

### Signal handlers

Signal handlers can be defined with a `$` prefix and `notify::` signal
handlers can be defined with a `$$` prefix.

> [!NOTE]
> Passed arguments by signals are not typed because of TypeScript limitations.
> Both properties and signals can be in either `camelCase`, `kebab-case` or `snake_case`.

```tsx
<Gtk.Revealer
    $$childRevealed={(self) => print(self, "child-revealed")}
    $destroy={(self) => print(self, "destroyed")}
/>
```

### Setup function

It is possible to define an arbitrary function to do something with the instance imperatively.
It is run **after** properties are set, signals are connected and children are appended and
**before** the `jsx` function returns.

```tsx
<Gtk.Stack $={(self) => print(self, "is about to be returned")} />
```

### Bindings

Properties can be set as a static value or can be passed a [Binding](./state).

```tsx
const opened = new State(false)

return (
    <Gtk.Button $clicked={() => opened.set(!opened.get())}>
        <Gtk.Revealer revealChild={bind(opened)}>
            <Gtk.Label label="content" />
        </Gtk.Revealer>
    </Gtk.Button>
)
```

### How children are passed to class components

Class components can only take `GObject.Object` instances as children.
They are set through the [`Gtk.Buildable.add_child`](https://docs.gtk.org/gtk4/iface.Buildable.html).

> [!NOTE]
> In Gnome extensions they are set with `Clutter.Actor.add_child`

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

## Function components

Function components don't really benefit from JSX, they are just called as is.

### Setup function

Just like class components, function components can also have a setup function.

```tsx
import { FCProps } from "gjsx/gtk4"

function MyComponent(props: FCProps<Gtk.Button, {}>) {
    return (
        <Gtk.Button>
            <Gtk.Label />
        </Gtk.Button>
    )
}

return <MyComponent $={(self) => print(self, "is a Button")} />
```

> [!NOTE] > `FCProps` is required for TypeScript to be aware of the `$` function.

### How children are passed to function components

They are passed in as `children` property. They can be of any type
and is statically checked by TypeScript.

```tsx
interface MyButtonProps {
    children: string
}

function MyButton({ children }: MyButtonProps) {
    return <Gtk.Button label={children} />
}

return <MyButton>Click Me</MyButton>
```

When multiple children are passed in `children` is an `Array`.

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

There is no builtin way to define signal handlers or bindings automatically
with function components, they have to be explicitly declared and handled.

```tsx
interface MyWidgetProps {
    label: Binding<string> | string
    onClicked: (self: Gtk.Button) => void
}

function MyWidget({ label, onClicked }: MyWidgetProps) {
    return <Gtk.Button $clicked={onClicked} label={label} />
}
```

## Control flow

### Dynamic rendering

When you want to render based on a value, you can use the `<With>` component.

```tsx
import { For } from "gjsx/gtk4"
import { State } from "gjsx/state"

const value = new State<{ member: string } | null>({
    member: "hello",
})

return (
    <With value={value()} cleanup={(label) => label.run_dispose()}>
        {(value) => value && <Gtk.Label label={value.member} />}
    </With>
)
```

> [!TIP]
> In a lot of cases it is better to always render the component and set its
> `visible` property instead because `<With>` will destroy/recreate the widget
> each time the passed `value` changes.

> [!WARNING]
> When the value changes and the widget is re-rendered the previous one is removed
> from the parent component and the new one is **appended**. Order of widgets are
> not kept so make sure to wrap `<With>` in a container to avoid this.

### List rendering

The `<For>` component let's you render based on an array dynamically.
Each time the array is changed it is compared with its previous state
and every widget associated with an item is removed and for every new item
a new widget is inserted.

```tsx
import { For } from "gjsx/gtk4"

let list: Binding<Array<object>>

return (
    <For each={list()} cleanup={(label) => label.run_dispose()}>
        {(item, index: Binding<number>) => (
            <Gtk.Label label={index((i) => `${i}. ${item}`)} />
        )}
    </For>
)
```

> [!WARNING]
> Similarly to `<With>`, when the list changes and a new item
> is added it is simply **appended** to the parent. Order of widgets
> are not kept so make sure to wrap `<For>` in a container to avoid this.

### Fragments

Both `<When>` and `<For>` are `Fragment`s. A `Fragment` is a collection of
children. Whenever the children array changes it is reflected on the parent
widget the `Fragment` was assigned to. When implementing custom widgets
you need to take into consideration the API being used for child insertion and removing.

- Both Gtk3 and Gtk4 uses the `Gtk.Buildable` interface to append children.
- Gtk3 uses the `Gtk.Container` interface to remove children.
- Gtk4 checks for a method called `remove`.
- Clutter uses `Clutter.Actor.add_child` and `Clutter.Actor.remove_child`.

## Intrinsic Elements

Intrinsic elements are globally available components which in
web frameworks are usually HTMLElements such as `<div>` `<span>` `<p>`.
There are no intrinsic elements by default, but they can be set.

> [!TIP]
> It should always be preferred to just export/import components.

- Function components

    ```tsx
    import { FCProps } from "gjsx/gtk4"
    import { intrinsicElements } from "gjsx/gtk4/jsx-runtime"

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

    return <my-label someProps="hello" />
    ```

- Class components

    ```tsx
    import { CCProps } from "gjsx/gtk4"
    import { intrinsicElements } from "gjsx/gtk4/jsx-runtime"
    import { property, register } from "gjsx/gobject"

    interface MyWidgetProps extends Gtk.Widget.ConstructorProps {
        someProp: string
    }

    @register()
    class MyWidget extends Gtk.Widget {
        @property(String) declare someProp: string

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

    return <my-widget someProps="hello" />
    ```
