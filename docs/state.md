# State management

## Binding

While in GJS you can use the `GObject.Object.bind_property` and
`GObject.Object.bind_property_full` APIs, they are not statically checked.

Gjsx provides a `Binding` object which holds information about
how to bind an object's property to another. A `Binding` itself
only holds information, it is meant to be consumed by other things.

```ts
import { type Binding, bind, sync } from "gjsx/state"

const obj1 = Gtk.Label.new("1")
const obj2 = Gtk.Label.new("2")

const binding: Binding<string> = bind(obj1, "label")
sync(obj2, "label", binding)

// the above two lines are essentially the same as
obj1.bind_property(
    "label",
    obj2,
    "label",
    GObject.BindingFlags.SYNC_CREATE,
)
```

## Transformations

Similarly to `bind_property_full` you can define transform function.

```ts
sync(obj2, "label", bind(obj1, "label").as(label => `transformed ${label}`))
```

> [!TIP]
> Bindings are immutable: `.as` always returns a new instance.

If you want a two way binding `sync` will have to be called twice.

> [!WARNING]
> Make sure the transform function you pass to it
> is pure as it can be called at any time internally.

## State

`State` is an object that works just like any other
`GObject.Object` but has only a single value and no properties.
It's main purpose is to substitute class properties and
hold state in [Function Components](./jsx#function-components).

```ts
import { State, bind } from "gjsx/state"

const state = new State<string>("0")

bind(state).as(value => parseInt(value))

// shorthand for the above
state(value => parseInt(value))

// value getters
state.get()
state.value

// setters
state.set("new value")
state.value = "new value"
```

> [!WARNING]
> New values are checked by reference and are not deeply reactive.
> This means mutating the value will not notify subscribers.
>
> ```ts
> const state = new State({ a: 0, b: "", c: false })
> const value = state.get()
>
> value.a++ // won't cause an update [!code error:2]
> state.value = value
> state.value = { ...value } // new object needs to be created
> ```

## Subscribing

You can run any side effect by subscribing to a Binding or State.

```ts
let observable: State<any> | Binding<any>

const unsubscribe = observable.subscribe(someProp => {
    console.log(someProp)
})

unsubscribe()
```

Optionally, it is possible to pass in another object to limit
the lifetime of the subscription.

```ts
observable.subscribe(otherobj, someProp => {
    console.log(someProp)
})
```

> [!NOTE]
> The lifetime is not limited to GObject ref count, but to the native
> JavaScript object. This means that calling `otherobj.run_dispose()`
> won't necessarily be enough to stop the subscription.

## Derived state

It is possible to derive `Bindings` and capture their value into a `State`.

```ts
import { State, derive, bind } from "./state"

const obj = Gtk.Label.new("hello")
const state1 = new State(0)
const state2 = new State({ member: "" })

const derived: State<[string, number, { member: string }]> = derive(
    [bind(obj, "label"), bind(state1), bind(state2)]
)
```

Optionally pass in a transform function:

```ts
const derived: State<string> = derive(
    [bind(obj, "label"), bind(state1), bind(state2)],
    (label, number, { member }) => `${label} ${number} ${member}`,
)
```

## Observing signals

It is possible to observe a list of signals and capture their values in State.

```ts
import { observe } from "gjsx/state"

const state = observe(
    "initial value",
    [obj1, "some-signal", (arg: string) => `captured ${arg}`],
    [obj2, "some-signal", (arg: number) => `captured ${arg}`],
)
```
