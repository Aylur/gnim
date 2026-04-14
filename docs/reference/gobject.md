# GObject decorators

Decorators that wrap
[`GObject.registerClass`](https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/Overrides.md?ref_type=heads#gobjectregisterclassmetainfo-klass).

Read more about GObjects in GJS on
[gjs.guide](https://gjs.guide/guides/gobject/basics.html).

> [!INFO] Required TypeScript settings
>
> Make sure `experimentalDecorators` is set to `true`.
>
> ```json
> { "compilerOptions": { "experimentalDecorators": true } }
> ```

## Example Usage

```ts
import GObject from "gi://GObject?version=2.0"
import { register, property, signal } from "gnim/gobject"

@register
class MyObj extends GObject.Object {
  @property myProp: string = ""

  @signal
  mySignal(a: string, b: number): void {
    // default handler
  }
}
```

::: details What it (roughly) transpiles to

```js
const priv = Symbol("private props")

class MyObj extends GObject.Object {
  [priv] = { "my-prop": "" }

  get myProp() {
    return this[priv]["my-prop"]
  }

  set myProp() {
    if (this[priv]["my-prop"] !== value) {
      this[priv]["my-prop"] = v
      this.notify("my-prop")
    }
  }

  mySignal(a, b) {
    return this.emit("my-signal", a, b)
  }

  on_my_signal(a, b) {
    // default handler
  }
}

GObject.registerClass(
  {
    Properties: {
      "my-prop": GObject.ParamSpec.string(
        "my-prop",
        "",
        "",
        GObject.ParamFlags.READWRITE,
        "",
      ),
    },
    Signals: {
      "my-signal": {
        param_types: [String.$gtype, Number.$gtype],
        return_type: GObject.VoidType.$gtype,
      },
    },
  },
  MyObj,
)
```

> [!NOTE]
>
> Property accessors are defined on the object instance and not the prototype.
> This might change in the future. Stage 3 decorators are adding a new keyword
> [`accessor`](https://github.com/tc39/proposal-decorators?tab=readme-ov-file#class-auto-accessors)
> for declaring properties, which marks properties to expand as `get` and `set`
> methods on the prototype. The `accessor` keyword is currently not supported by
> these decorators.

:::

## Property decorator

Property declarations can be used on fields and accessors:

```ts
class MyObject {
  @property
  field: number = 1

  @property
  get readonly(): number {}

  @property
  set writeonly(v: number) {}

  @property
  get readwrite(): number {}
  set readwrite(v: number) {}
}
```

### Property type declaration

The runtime type of the property will be inferred from TypeScript annotations.
Optionally, it can be explicitly declared by passing an argument to the
decorator.

```ts
type PropertyTypeDeclaration<T = unknown> =
  | ((name: string, flags: ParamFlags) => ParamSpec<T>)
  | ParamSpec<T>
  | GType<T>
  | { $gtype: GType<T> }
```

The declaration can be

- any class that has a registered `GType`. This includes the globally available
  `String`, `Number`, `Boolean` and `Object` JavaScript constructors and any
  class that inherits from `GObject.Object`.

- a function that produces a `ParamSpec` where the passed name is a kebab cased
  version of the name of the property (for example `myProp` -> `my-prop`), and
  flags is one of: `ParamFlags.READABLE`, `ParamFlags.WRITABLE`,
  `ParamFlags.READWRITE`.

```ts
class MyObject {
  @property(GObject.UInt)
  guint = 0

  @property((name, flags) =>
    GObject.ParamSpec.enum(
      name,
      null,
      null,
      flags,
      Gtk.Orientation,
      Gtk.Orientation.VERTICAL,
    ),
  )
  myOrientation = Gtk.Orientation.VERTICAL
}
```

### Property accessors

When implementing property setters you will also need to explicitly emit notify
signals.

```ts
class MyObject {
  #prop: number = 1

  @property
  set myProp(v: number) {
    if (this.#prop !== v) {
      this.#prop = v
      this.notify("my-prop")
    }
  }
}
```

## Signal decorator

Signal decorator can be used on methods which will emit the signal:

```ts
class {
  @signal
  mySignal(arg: number): void {
    // default handler
  }
}
```

### Signal type declaration

The runtime type of the parameters and return type will be inferred from
TypeScript annotations. Optionally they can be explicitly declared.

```ts
class MyObject {
  @signal([GObject.UInt], GObject.VoidType)
  mySignal(arg: number): void {
    // default handler
  }
}
```

### SignalOptions

```ts
type SignalOptions = {
  default?: boolean
  flags?: SignalFlags
  accumulator?: AccumulatorType
}
```

Passing `default: false` to the signal will skip registering the method as a
default handler

```ts
class MyObject {
  @signal({ default: false })
  s() {
    throw "this is never called"
  }

  @signal([], GObject.VoidType, {
    default: false,
  })
  s() {
    throw "this is never called"
  }
}
```

## Register decorator

```ts
@register
class MyObj extends GObject.Object {}
```

You can optionally pass the same options to this decorator as you would to
`GObject.registerClass`.

```ts
@register({ GTypeName: "MyObj" })
class MyObj extends GObject.Object {}
```

> [!TIP]
>
> This decorator registers properties and signals defined with decorators, so
> make sure to use this and **not** `GObject.registerClass`.
