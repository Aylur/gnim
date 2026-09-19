# Primitives

Gnim is built around the `Accessor` primitive, which is a read-only reactive
value. Accessors are essentially functions that let you read a value and track
it in reactive scopes so that when it changes, the reader is notified.

```ts
interface Accessor<T> {
  (): T
  peek(): T
  as<R = T>(fn: (value: T) => R): Accessor<R>
}
```

There are two ways to read the current value:

- `(): T`: which returns the current value and tracks it as a dependency in
  reactive scopes
- `peek(): T` which returns the current value **without** tracking it as a
  dependency

`.as()` can be used to simply map the value without doing any memoization or
validation.

```ts
const n: Accessor<number>
const s: Accessor<string> = n.as((v) => v.toString())
```

> [!IMPORTANT]
>
> The body of `.as()` is run on each access. If you need memoization use
> [`computed()`](#computed).

Gnim's reactive system is synchronous: Setting a state notifies synchronously:
by the time the setter returns, every [`computed`](#computed) depending on it is
marked stale and every [`effect`](#effect) and [`subscribe`](#subscribe)
callback depending on it has already re-run.

```ts
const [s, setS] = createState(1)
const a = computed(() => s() * 10)
const b = computed(() => s() * 100)
const sum = computed(() => a() + b())

subscribe(sum, () => console.log(sum.peek()))
setS(2) // logs 220, exactly once
```

## `createState`

Creates a writable reactive value.

```ts
function createState<T>(
  init: T,
  opts?: StateOptions<T>,
): [Accessor<T>, Setter<T>]

interface StateOptions<T> {
  equals?(prev: T, next: T): boolean
}
```

Example:

```ts
const [value, setValue] = createState(0)

// setting its value
setValue(2)
setValue((prev) => prev + 1)
```

The producer form receives the latest value, including one set earlier in the
same [`batch`](#batch).

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

You can pass in a custom `equals` function to customize this behavior, for
example to always notify subscribers:

```ts
const [value, setValue] = createState("initial value", {
  equals: () => false,
})
```

## `computed`

Creates a derived value that tracks its dependencies and memoizes the result.

```ts
function computed<T>(
  compute: (prev?: T) => T,
  opts?: StateOptions<T>,
): Accessor<T>

interface StateOptions<T> {
  equals?(prev: T, next: T): boolean
}
```

> [!NOTE]
>
> This operation is also known as a `memo` in other libraries.

Example:

```ts
let a: Accessor<number>
let b: Accessor<number>

const c: Accessor<number> = computed(() => a() + b())
```

The computation is lazy: it runs on the first read, and then at most once per
dependency change, on the next read. Observers are only notified when the result
changed according to `equals`, which defaults to `Object.is`.

## `bind`

Creates an `Accessor` on a `GObject.Object`'s `property` or a
[Store](#createstore)'s field.

```ts
type Bindable = Store | GObject.Object

function bind<T extends Bindable, K extends PropKeys<T>>(
  bindable: T,
  key: K,
): Accessor<Prop<T, K>>
```

> [!IMPORTANT]
>
> `bind` infers available properties from the
> [`$readableProperties`](/reference/typescript#type-annotations) annotation and
> falls back to `keyof T` when it's empty or missing.

Example:

```ts
const styleManager = Adw.StyleManager.get_default()
const style = bind(styleManager, "color-scheme")
```

For GObject properties the `get_*` getter is preferred over the plain property,
and the `notify::*` signal is only connected while something tracks the
accessor.

It also supports nested bindings. The accessor resolves to `null` or `undefined`
when a link in the chain is.

```ts
interface Outer extends GObject.Object {
  nested: Inner | null
}

interface Inner extends GObject.Object {
  field: string
}

const value: Accessor<string | null> = bind(outer, "nested", "field")
```

## `effect`

Schedule a function to run after the current `Scope` returns, tracking
dependencies and re-running the function whenever they change.

```ts
function effect<T>(fn: (prev?: T) => T): () => void
```

Example:

```ts
const count: Accessor<number>

effect(() => {
  console.log(count()) // reruns whenever count changes
})

const dispose = effect(() => {
  console.log(count.peek()) // only runs once, equivalent to `onMount`
})

dispose() // can be stopped manually
```

> [!CAUTION]
>
> Effects are a common pitfall for beginners when deciding when to use them and
> when not to use them. You can read about
> [when it is discouraged and their alternatives](/tutorial/gnim#when-not-to-use-an-effect).

## `subscribe`

Subscribes to value changes.

```ts
function subscribe<T>(track: () => void, callback: (prev?: T) => T): () => void
```

`track` is run to collect dependencies: pass an accessor directly, or a function
that reads several. Whenever one of them changes, dependencies are collected
again and `callback` runs. Reads inside `callback` are not tracked.

```ts
const a: Accessor<number>
const b: Accessor<number>

subscribe(a, () => {
  console.log("value of a changed to", a.peek())
})

const unsubscribe = subscribe(
  () => {
    a()
    b()
  },
  () => console.log("a or b changed"),
)

unsubscribe() // can be stopped manually
```

> [!WARNING]
>
> Do not forget to clean them up outside of tracking scopes when no longer
> needed

## `untrack`

Lets you read `Accessor` and [`Store`](#createstore) without tracking them.

```ts
const value: Accessor<T>
const store: Store<{ field: string }>

const _ = untrack(() => value())
const _ = value.peek() // same as above
const _ = untrack(() => store.field)
```

## `batch`

Groups multiple updates so that effects and subscriptions run once after the
batch completes instead of after each individual update.

```ts
function batch(fn: () => void): void
```

Example:

```ts
const [count, setCount] = createState(0)
const [total, setTotal] = createState(0)

effect(() => console.log(`${count()} / ${total()}`)) // logs "0 / 0"

setCount(1) // logs "1 / 0"
setTotal(5) // logs "1 / 5"

batch(() => {
  setCount(2)
  setTotal(10)
}) // logs "2 / 10"
```

Reads inside the batch see the latest values. Nested batches flush once the
outermost one completes.

## `connectSignal`

Connecting to GObject signals can be done via a pair of `.connect()` and
`onCleanup()`. This is a shorter version of exactly that.

```ts
const id = object.connect("signal", (_, ...args) => {
  // handler
})

onCleanup(() => object.disconnect(id))
```

Can be written as:

```ts
connectSignal(object, "signal", (...args) => {
  // handler
})
```

## `createStore`

Creates an object where each field is replaced with a reactive accessor. Plain
fields become writable states, getters become memoized computed values and
methods are kept as they are.

```ts
const store = createStore({
  value: 0,
  get double() {
    return this.value * 2
  },
})
```

::: details Stores under the hood

The above example can be thought of as a set of values created with
`createState` and `computed` exposed through object property accessors.

```ts
function createMyStore() {
  const [value, setValue] = createState(0)
  const double = computed(() => value() * 2)

  return {
    get value() {
      return value()
    },
    set value(v) {
      setValue(v)
    },
    get double() {
      return double()
    },
  }
}
```

:::

Accessing store values is reactive.

```ts
const v = computed(() => store.value)

effect(() => {
  console.log(store.value)
})
```

To read a store value in a reactive scope without tracking it as a dependency
use [`untrack`](#untrack).

```ts
effect(() => {
  console.log(untrack(() => store.value))
})
```

To pass them as reactive props you can use [`bind`](#bind).

```tsx
<Component value={bind(store, "value")} />
```

> [!IMPORTANT] Nested stores
>
> When mutating a value which is a nested store make sure to use `createStore`
> to not lose reactivity.
>
> ```ts
> const store = createStore({
>   value: 0,
>   nested: createStore({
>     value: 0,
>   }),
> })
>
> store.nested = createStore({
>   ...store.nested,
> })
> ```
>
> Note that using the spread operator assigns values meaning that derived values
> defined using the getter syntax will no longer track their dependencies.

## `createAccessor`

Creates an `Accessor` over a getter function.

```ts
function createAccessor<T>(
  get: () => T,
  subscribe: (notify: () => void) => () => void,
): Accessor<T>
```

This can be used to integrate other systems that implement the Observable
pattern <span style="opacity:0.6">(such as GObject)</span> with Gnim's reactive
system.

```ts
function bindTitle(window: Gtk.Window): Accessor<string> {
  return createAccessor(
    function get() {
      return window.title
    },
    function subscribe(notify) {
      const id = window.connect("notify::title", notify)
      return () => window.disconnect(id)
    },
  )
}
```

`subscribe` is only called the first time the accessor is read in a tracking
scope, and the disconnect function is called once nothing tracks it anymore.
While subscribed, the value is cached and only re-read when `notify` is called.
Observers are notified only when it changed according to `Object.is`.

> [!TIP]
>
> For binding GObject properties prefer using [bind](#bind).

## `isAccessor`

Checks whether a value is an `Accessor`. Useful for props that accept either a
plain value or an accessor, see [`prop`](/reference/jsx#prop).

```ts
function isAccessor(value: unknown): value is Accessor
```

```ts
const [count] = createState(0)

isAccessor(count) // true
isAccessor(() => count()) // false
```

## Scopes and Life cycle

A scope holds cleanup functions, child scopes and context values. `effect` and
`computed` create scopes of their own, so everything allocated inside them is
torn down before they re-run.

```js
createRoot(() => {
  const scope = getScope()

  // Inside this function scope, synchronously executed code will have access
  // to `scope` through `getScope()` and will attach any allocated resources,
  // such as signal subscriptions.
  scopedFunction()

  // At a later point it can be disposed.
  scope.dispose()
})
```

Disposing a scope disposes its child scopes first, then runs its own cleanup
callbacks in reverse registration order.

### `createRoot`

```ts
function createRoot<T>(fn: (dispose: () => void) => T, parent?: Scope | null): T
```

Creates a root scope. You likely won't need to use it since `render()` will
create a root scope for you.

`parent` defaults to the current scope, so that disposing the parent also
disposes the root. Pass `null` for a root that is only disposed explicitly.

Example:

```tsx
let state: Accessor<number>

createRoot((dispose) => {
  effect(() => {
    if (state() > 5) {
      dispose()
    }
  })
})
```

### `getScope`

Gets the current scope. Throws when there is none. You might need to reference
the scope in cases where async functions need to run in the scope.

Example:

```ts
const scope = getScope()
setTimeout(() => {
  // This callback gets run without an owner scope.
  // Restore owner via runScope:
  runScope(scope, () => {
    const foo = FooContext.use()
    onCleanup(() => {
      print("some cleanup")
    })
  })
}, 1000)
```

### `runScope`

```ts
function runScope<T>(scope: Scope, fn: () => T): T
```

Runs `fn` with `scope` as the current scope, so that `onCleanup`, `effect` and
contexts inside attach to it. Throws when the scope is already disposed.

### `onCleanup`

Attaches a cleanup function to the current scope. Cleanups run untracked, in
reverse registration order.

Example:

```tsx
function MyComponent() {
  const interval = setInterval(() => console.log("tick"), 1000)

  onCleanup(() => {
    clearInterval(interval)
  })

  return <></>
}
```

### `onMount`

Schedule a function to run after the current scope returns. Effects use the same
mechanism for their first run. When the scope is already mounted, or there is no
scope, the callback runs immediately.

Example:

```tsx
function MyWindow() {
  let win: Gtk.Window

  onMount(() => {
    win.present()
  })

  return <Gtk.Window ref={(self) => (win = self)} />
}
```

> [!NOTE]
>
> `onMount` can be thought of as an alias for `fn => effect(() => untrack(fn))`

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
    <MyContext value="my-value">
      <ConsumerComponent />
    </MyContext>
  )
}
```

Outside of JSX, `provide` runs a function in a new child scope where `use`
returns the given value.

```ts
MyContext.provide("my-value", () => {
  MyContext.use() // "my-value"
})
```
