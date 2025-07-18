# Gnim

While GTK has its own templating system, it lacks in the DX department.
[Blueprint](https://gnome.pages.gitlab.gnome.org/blueprint-compiler/) tries to
solve this, but it is still not as convenient as JSX. Gnim aims to bring the
kind of developer experience to GJS that libraries like React and Solid offer
for the web.

> [!WARNING] Gnim is not React
>
> While some concepts are the same, Gnim has nothing in common with React other
> than the JSX syntax.

## Scopes

Before jumping into JSX, you have to understand the concept of scopes first. A
scope's purpose in Gnim is to collect cleanup functions and hold context values.

A scope is essentially an object that synchronously executed code has access to.

```ts
let scope: Scope | null = null

function printScope() {
  print(scope)
}

function nested() {
  printScope() // scope

  setTimeou(() => {
    // this block of code gets executed after the last line
    // at which point scope no longer exists
    printScope() // null
  })
}

function main() {
  printScope() // scope
  nested()
}

scope = new Scope()

// at this point synchronously executed code can access scope
main()

scope = null
```

The reason we need scopes is so that Gnim can cleanup any kind of gobject
connection, signal subscription and effect.

![Scope Diagram](/scope-dark.svg){.dark-only}
![Scope Diagram](/scope-light.svg){.light-only}

<style>
html:not(.dark) .dark-only { display: none !important; }
html.dark .light-only { display: none !important; }
</style>

In this example we want to render a list based on `State2`. It is accomplished
by running each `Child` in their own scope so that when they need to be removed
we can just cleanup the scope. This behaviour also cascades: if the root scope
were to be cleaned up the nested scope would also be cleaned up as a result.

Gnim manages scopes for you, the only scope you need to take care of is the
root, which is usually tied to a window.

```ts
import { createRoot } from "gnim"

const win = createRoot((dispose) => {
  const win = new Gtk.Window()
  win.connect("close-request", dispose)
  return win
})
```

To attach a cleanup function to the current scope, simply use `onCleanup`.

```ts
import { onCleanup } from "gnim"

function fn() {
  onCleanup(() => {
    console.log("scope cleaned up")
  })
}
```

## JSX Markup

JSX is a syntax extension to JavaScript. It is simply a syntactic sugar for
function composition. In Gnim, JSX is also used to enhance
[GObject construction](../jsx#class-components).

### Creating and nesting widgets

```tsx
function MyButton() {
  return (
    <Gtk.Button onClicked={(self) => console.log(self, "clicked")}>
      <Gtk.Label label="Click me!" />
    </Gtk.Button>
  )
}
```

Now that you have declared `MyButton`, you can nest it into another component.

```tsx
function MyWindow() {
  return (
    <Gtk.Window>
      <Gtk.Box>
        Click The button
        <MyButton />
      </Gtk.Box>
    </Gtk.Window>
  )
}
```

Notice that widgets start with a capital letter. Lower case widgets are
[intrinsic elements](../jsx#intrinsic-elements)

### Displaying Data

JSX lets you put markup into JavaScript. Curly braces let you “escape back” into
JavaScript so that you can embed some variable from your code and display it.

```tsx
function MyButton() {
  const label = "hello"

  return <Gtk.Button>{label}</Gtk.Button>
}
```

You can also pass JavaScript to markup properties.

```tsx
function MyButton() {
  const label = "hello"

  return <Gtk.Button label={label} />
}
```

### Conditional Rendering

You can use the same techniques as you use when writing regular JavaScript code.
For example, you can use an if statement to conditionally include JSX:

```tsx
function MyWidget() {
  let content

  if (condition) {
    content = <True />
  } else {
    content = <False />
  }

  return <Gtk.Box>{content}</Gtk.Box>
}
```

You can also inline a
[conditional `?`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_operator)
(ternary) expression.

```tsx
function MyWidget() {
  return <Gtk.Box>{condition ? <True /> : <False />}</Gtk.Box>
}
```

When you don’t need the `else` branch, you can also use a shorter
[logical && syntax](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND#short-circuit_evaluation):

```tsx
function MyWidget() {
  return <Gtk.Box>{condition && <True />}</Gtk.Box>
}
```

> [!TIP]
>
> [falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy) values are
> not rendered.

### Rendering lists

You can use
[`for` loops](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/for)
or
[array `map()` function](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).

```tsx
function MyWidget() {
  const labels = ["label1", "label2", "label3"]

  return (
    <Gtk.Box>
      {labels.map((label) => (
        <Gtk.Label label={label} />
      ))}
    </Gtk.Box>
  )
}
```

### Widget signal handlers

You can respond to events by declaring event handler functions inside your
widget:

```tsx
function MyButton() {
  function onClicked(self: Gtk.Button) {
    console.log(self, "was clicked")
  }

  return <Gtk.Button onClicked={onClicked} />
}
```

### How properties are passed

Using JSX, a custom widget will always have a single object as its parameter.

```ts
type Props = {
  myprop: string
  children?: JSX.Element | Array<JSX.Element>
}

function MyWidget({ myprop, children }: Props) {
  //
}
```

> [!TIP]
>
> `JSX.Element` is an alias to `GObject.Object`

The `children` property is a special one which is used to pass the children
given in the JSX expression.

```tsx
// `children` prop of MyWidget is the Box
return (
  <MyWidget myprop="hello">
    <Gtk.Box />
  </MyWidget>
)
```

```tsx
// `children` prop of MyWidget is [Box, Box]
return (
  <MyWidget myprop="hello">
    <Gtk.Box />
    <Gtk.Box />
  </MyWidget>
)
```

## State management

State is managed using signals which are called `Accessor` in Gnim. The most
common signal you will use is [`createState`](../jsx#createstate),
[`createBinding`](../jsx#createbinding) and
[`createComputed`](../jsx#createcomputed). `createState` is a writable signal,
`createBinding` is used to hook into GObject properties and `createComputed` is
used to derive signals.

:::code-group

```tsx [State example]
import { createState } from "gnim"

function Counter() {
  const [count, setCount] = createState(0)

  function increment() {
    setCount((v) => v + 1)
  }

  const label = count((num) => num.toString())

  return (
    <Box>
      <Label label={label} />
      <Button onClicked={increment}>Click to increment</Button>
    </Box>
  )
}
```

```tsx [GObject example]
import GObject, { register, property } from "gnim/gobject"
import { createBinding } from "gnim"

@register()
class CountStore extends GObject.Object {
  @property(Number) counter = 0
}

function Counter() {
  const count = new CountStore()

  function increment() {
    count.counter += 1
  }

  const counter = createBinding(count, "counter")
  const label = counter((num) => num.toString())

  return (
    <Box>
      <Label label={label} />
      <Button onClicked={increment}>Click to increment</Button>
    </Box>
  )
}
```

:::

Accessors can be called as a function which lets you transform its value. In the
case of a `Gtk.Label` in this example, its label property expects a string, so
it needs to be turned into a string first.

## Dynamic rendering

When you want to render based on a value, you can use the `<With>` component.

```tsx
import { With, Accessor } from "gnim"

let value: Accessor<{ member: string } | null>

return (
  <Box>
    <With value={value}>
      {(value) => value && <Label label={value.member} />}
    </With>
  </Box>
)
```

> [!TIP]
>
> In a lot of cases it is better to always render the component and set its
> `visible` property instead.

<!-- -->

> [!WARNING]
>
> When the value changes and the widget is re-constructed, the previous one is
> removed from the parent component and the new one is _appended_. Order of
> widgets are _not_ kept, so make sure to wrap `<With>` in a container to avoid
> it. This is due to Gtk not having a generic API on containers to sort widgets.

## Dynamic list rendering

The `<For>` component let's you render based on an array dynamically. Each time
the array changes it is compared with its previous state. Widgets for new items
are inserted while widgets associated with removed items are removed.

```tsx
import { For, Accessor } from "gnim"

let list: Accessor<Array<any>>

return (
  <Box>
    <For each={list}>
      {(item, index: Accessor<number>) => (
        <Label label={index.as((i) => `${i}. ${item}`)} />
      )}
    </For>
  </Box>
)
```

> [!WARNING]
>
> Similarly to `<With>`, when the list changes and a new item is added, it is
> simply **appended** to the parent. Order of sibling widgets are _not_ kept, so
> make sure to wrap `<For>` in a container to avoid this.

## Effects

> [!NOTE]
>
> When we talk about effects, we mean subscribing to signals or gobjects and
> having a **sideeffect** in the handler.

When we think of state, we usually think in effects. For example, when we have a
signal `a` and we want to compute `b` from it, our initial though might be to
create a _writable_ signal and listen for changes. When `a` changes we simply
set `b`.

```ts
const a: Accessor<number>
const [b, setB] = createState(a.get() * 2)

// 🔴 Avoid: redundant state and unnecessary effect
// and error prone to memory leaks
a.subscribe(() => {
  setB(a.get() * 2)
})
```

You might forget to cleanup the subscription and leak memory, your
initialization logic might differ from the body of the handler which might lead
to bugs and with increasing number of dependencies it grows in complexity.

```ts
const a: Accessor<number>

// ✅ Good: computed signal from dependencies
const b = createComputed([a], (a) => a * 2)
```

> [!TIP]
>
> Using `.get()` outside of event handlers should be your clue to rethink your
> logic in a series of computations rather than a chain of effects.

### Effect hook

Gnim deliberately does not provide a `useEffect` hook like React. You are
supposed to setup the effect and use `onCleanup` manually.

### Accessor subscription

```ts
function MyWidget() {
  const unsub = accessor.subscribe(() => {
    // sideeffect
  })
  onCleanup(unsub)
}
```

> [!TIP]
>
> You can use [`createComputed`](../jsx#createcomputed) to subscribe to multiple
> accessors at once.
>
> ```ts
> const unsub = createComputed([a, b, c]).subscribe(() => {
>   // sideeffect
> })
> ```

### GObject signal subscription

```ts
function MyWidget() {
  const id = gobject.connect("signal", () => {
    // sideeffect
  })
  onCleanup(() => gobject.disconnect(id))
}
```

> [!TIP]
>
> You can use [`craeteConnection`](../jsx#createconnection) as an alternative.

### Timers

```ts
function MyWidget() {
  const interval = setInterval(() => {
    // sideeffect
  })
  onCleanup(() => clearInterval(interval))
}
```

> [!TIP]
>
> You can use [`craeteExternal`](../jsx#createexternal) as an alternative.
