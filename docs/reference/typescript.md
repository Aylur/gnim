# TypeScript

GObject has a few additional concepts about class methods and properties that
cannot be expressed with TypeScript alone. For these we have a few special type
only fields on classes.

We have annotations for:

- signals
- readable properties
- writable properties
- construct-only properties

When implementing a GObject subclass you might want to annotate a subset of
these or all of these depending on usecase.

## Generating types

Generating types can be done via the Gnim CLI.

```sh
gnim types --help
```

## Type annotations

Every class that inherits from GObject is going to include a namespace
containing type declarations where each member is written in `kebab-case`:

```ts
namespace MyClass {
  export interface SignalSignatures extends GObject.Object.SignalSignatures {
    // simple signal
    "my-signal"(arg: number): void
    // detailed signal annotated with the `::{}` suffix
    "my-detailed-signal::{}"(arg: number): void
  }

  // ReadableProperties is also used for notify signal annotations
  export interface ReadableProperties
    extends GObject.Object.ReadableProperties {
    // property which has a public getter
    "my-prop": number
  }

  export interface WritableProperties
    extends GObject.Object.WritableProperties {
    // property which has a public setter
    "my-prop": number
  }

  export interface ConstructOnlyProperties
    extends GObject.Object.ConstructOnlyProperties {
    // property which can only be set at construction
    "my-ctor-prop": number
  }
}
```

And the Class will refer to these using special `$` prefixed fields:

> [!IMPORTANT]
>
> These fields don't exist at runtime, they are used by other APIs to introspect
> GObjects.

```ts
class MyClass extends GObject.Object {
  declare readonly $signals: MyClass.SignalSignatures
  declare readonly $readableProperties: MyClass.ReadableProperties
  declare readonly $writableProperties: MyClass.WritableProperties
  declare readonly $constructOnlyProperties: MyClass.ConstructOnlyProperties

  // GObject.ConstructorProps can be used to infer props from the annotations
  constructor(props: Partial<GObject.ConstructorProps<MyClass>>) {
    super(props)

    // note that properties will be annotated as camelCase
    console.log(props.myProp, props.myCtorProp)
  }

  @signal
  mySignal(arg: number): void {}

  @signal({ flags: GObject.SignalFlags.DETAILED })
  myDetailedSignal(arg: number): void {}

  @property
  myProp: number = 0
}
```

Methods such as `connect()`, `emit()`, `notify()` and functions such as
[`bind()`](/reference/primitives#bind) and
[`connectSignal()`](/reference/primitives#connectsignal) will infer from these
annotations.

```ts
const instance = new MyClass()

instance.connect("my-signal", (source, arg) => {
  console.log(arg)
})

instance.connect("my-detailed-signal::detail", (source, arg) => {
  console.log(arg)
})

connectSignal(instance, "my-signal", (arg) => {
  console.log(arg)
})

const myProp = ref(instance, "my-prop")
```

Due to how TypeScript `this` type works, you need to annotate `this` or use a
typecast to correctly infer types within the class.

```ts
class MyClass {
  myFn(this: MyClass) {
    this.notify("my-prop")
  }

  myFn() {
    const self = this as MyClass
    self.notify("my-prop")
  }
}
```

## Annotating GI imports

You can define non versioned gi imports.

:::code-group

```ts [env.d.ts]
declare module "gi://Gtk" {
  import Gtk from "gi://Gtk?version=4.0"
  export default Gtk
}
```

:::

You can also use the `--short-imports` flag when generating types to do it
automatically, which will generate an alias for each namespace.

> [!TIP]
>
> To target specific versions you can ignore other versions.
>
> ```sh
> gnim types -i Gtk-3.0 -i Gdk-3.0 --short-imports
> ```

## Escape hatches

To avoid using `@ts-expect-error` or `as any` assertions when the signal name is
a `string` you can use non typed versions of signal related functions:

```ts
GObject.signal_connect(object, "signal-name", (emitter, ...args) => {
  console.log(emitter, ...args)
})

GObject.signal_emit_by_name(object, "signal-name", arg1, arg2)
```
