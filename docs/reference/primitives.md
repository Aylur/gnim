# Primitives

Gnim is built around the `Accessor` primitive, which is a read-only reactive
value. They are essentially functions that let you read a value and track it in
reactive scopes so that when they change the reader is notified.

```ts
interface Accessor<T> {
  (): T
  as<R = T>(fn: (value: T) => R): Accessor<R>
  peek(): T
  subscribe(callback: () => void): () => void
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
  console.log("value of accessor changed to", accessor.peek())
})

unsubscribe()
```

> [!WARNING]
>
> The subscribe method is not scope aware. Do not forget to clean them up when
> no longer needed. Alternatively, use an [`effect`](#effect) instead.

The `.as()` can be used to simply map the value without doing any memoization or
validation.

```ts
const n: Accessor<number>
const s: Accessor<string> = n.as((v) => v.toString())
```

### `createState`

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

### `computed`

Create a computed value which tracks dependencies and memoizes the value.

```ts
function computed<T>(compute: () => T, opts?: StateOptions<T>): Accessor<T>

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

### `untrack`

Alternative to `.peek()`: it lets you read `Accessor` values without tracking
them.

```ts
let value: Accessor<T>

const a = value.peek()
const b = untrack(() => value())
```

### `bind`

Creates an `Accessor` on a `GObject.Object`'s `property` or a
[Store](#createStore).

```ts
type Bindable = Store | GObject.Object

function bind<T extends Bindable, P extends PropKeys<T>>(
  object: T,
  property: P,
): Accessor<T[P]>
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

It also supports nested bindings.

```ts
interface Outer extends GObject.Object {
  nested: Inner | null
}

interface Inner extends GObject.Object {
  field: string
}

const value: Accessor<string | null> = bind(outer, "nested", "field")
```

### `effect`

Schedule a function to run after the current `Scope` returns, tracking
dependencies and re-running the function whenever they change.

```ts
function effect(fn: () => void): void
```

Example:

```ts
const count: Accessor<number>

effect(() => {
  console.log(count()) // reruns whenever count changes
})

effect(() => {
  console.log(count.peek()) // only runs once
})
```

> [!CAUTION]
>
> Effects are a common pitfall for beginners to understand when to use and when
> not to use them. You can read about
> [when it is discouraged and their alternatives](/tutorial/gnim#when-not-to-use-an-effect).

### `connectSignal`

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

### `createStore`

Creates an object where each field is replaced with a reactive accessor.

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

Accessing store values are reactive.

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

To pass them as reactive props you can use [`bind`](#bind)

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

## Scopes and Life cycle

A scope is essentially a global object which holds cleanup functions and context
values.

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
function createRoot<T>(fn: (dispose: () => void) => T, owner?: Scope)
```

Creates a root scope. You likely won't need to use it since `render()` will
create a root scope for you.

Example:

```tsx
let state: Accessor<number>

createRoot((dipose) => {
  effect(() => {
    if (state() > 5) {
      dispose()
    }
  })
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
