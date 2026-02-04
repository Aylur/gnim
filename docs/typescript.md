# TypeScript

GObject has a few additional concepts about class methods and properties that
cannot be expressed with TypeScript alone. For these we have a few special type
only fields on classes.

We have annotations for:

- signals
- readable properties
- writable properties
- contstruct-only properties

When implementing a GObject subclass you might want to annotate a subset of
these or all of these depending on usecase.

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

  @signal(Number)
  mySignal(arg: number): void {}

  @signal([Number], GObject.VoidType, {
    flags: GObject.SignalFlags.DETAILED,
  })
  myDetailedSignal(arg: number): void {}

  @property(Number) get myProp() {
    return 0
  }

  @property(Number) set myProp(n: number) {
    //
  }
}
```

The `connect`, `emit` and `notify` functions will also infer from these
annotations.

```ts
const instance = new MyClass()

instance.connect("my-signal", (source, arg) => {
  console.log(arg)
})

instance.connect("my-detailed-signal::detail", (source, arg) => {
  console.log(arg)
})
```

Due to how TypeScript `this` type works, you need to annotate `this` or use a
typecast to make it work inside the class.

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

## Escape hatches

To avoid using `@ts-expect-error` or `as any` assertions when the signal name is
a `string` you can use non typed versions of signal related functions:

```ts
GObject.signal_connect(object, "signal-name", (emitter, ...args) => {
  console.log(emitter, ...args)
})

GObject.signal_emit_by_name(object, "signal-name", arg1, arg2)
```
