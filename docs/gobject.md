# GObject decorators

Decorators that wrap
[`GObject.registerClass`](https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/Overrides.md?ref_type=heads#gobjectregisterclassmetainfo-klass).

> [!INFO] Required TypeScript settings
>
> Make sure `experimentalDecorators` is set to `false` and `target` is _less
> than or equal_ to `ES2020` in `tsconfig.json`.
>
> ```json
> {
>   "compilerOptions": {
>     "experimentalDecorators": false,
>     "target": "ES2020"
>   }
> }
> ```

## Example Usage

```ts
import GObject, { register, property, signal } from "gnim/gobject"

@register({ GTypeName: "MyObj" })
class MyObj extends GObject.Object {
  @property(String) myProp = ""

  @signal(String, GObject.TYPE_UINT)
  mySignal(a: string, b: number) {
    // default handler
  }
}
```

::: details What it (roughly) transpiles to

```js
const priv = Symbol("private props")

class MyObj extends GObject.Object {
  [priv] = { "my-prop": "" }

  constructors() {
    super()
    Object.defineProperty(this, "myProp", {
      enumerable: true,
      configurable: false,
      set(value) {
        if (this[priv]["my-prop"] !== value) {
          this[priv]["my-prop"] = v
          this.notify("my-prop")
        }
      },
      get() {
        return this[priv]["my-prop"]
      },
    })
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
    GTypeName: "MyObj",
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
        param_types: [String.$gtype, GObject.TYPE_UINT],
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

Property declarations are split into three decorators:

```ts
type PropertyTypeDeclaration<T> =
  | ((name: string, flags: ParamFlags) => ParamSpec<T>)
  | { $gtype: GType<T> }

function property<T>(typeDeclaration: PropertyTypeDeclaration<T>): void
function setter<T>(typeDeclaration: PropertyTypeDeclaration<T>): void
function getter<T>(typeDeclaration: PropertyTypeDeclaration<T>): void
```

These decorators take a single parameter that defines the type:

- any class that has a registered `GType`. This includes the globally available
  `String`, `Number`, `Boolean` and `Object` JavaScript constructors, which are
  mapped to their relative `GObject.ParamSpec`.

  - `Object`: `ParamSpec.jsobject`
  - `String`: `ParamSpec.string`
  - `Number`: `ParamSpec.double`
  - `Boolean`: `ParamSpec.boolean`
  - `GObject.Object` and its subclasses

- a function that produces a `ParamSpec` where the passed name is a kebab-cased
  name of the property (for example `myProp` -> `my-prop`), and flags is one of:
  `ParamFlags.READABLE`, `ParamFlags.WRITABLE`, `ParamFlags.READWRITE`.

  ```ts
  const Percent = (name: string, flags: ParamFlags) =>
    GObject.ParamSpec.double(name, "", "", flags, 0, 1, 0)

  @register()
  class MyObj extends GObject.Object {
    @property(Percent) percent = 0
  }
  ```

### `property`

The `property` decorator lets you declare a read-write property.

```ts {3}
@register()
class MyObj extends GObject.Object {
  @property(String) myProp = ""
}
```

This will create a getter and setter for the property and will also emit the
notify signal when the value is set to a new value.

> [!WARNING]
>
> The value is checked by reference, which is important if your property is an
> object type.
>
> ```ts
> const dict = obj.prop
> dict["key"] = 0
> obj.prop = dict // This will not emit notify::prop // [!code error]
> obj.prop = { ...dict } // This will emit notify::prop
> ```

When using custom subclasses as properties, you might want to annotate its
`$gtype`.

```ts {3,8}
@register()
class DeepProp extends GObject.Object {
  declare static $gtype: GObject.GType<DeepProp>
}

@register()
class MyClass extends GObject.Object {
  @property(DeepProp) prop: DeepProp
}
```

### `getter`

The `getter` decorator lets you declare a read-only property.

```ts {3}
@register()
class MyObj extends GObject.Object {
  @getter(String)
  get readOnly() {
    return "readonly value"
  }
}
```

### `setter`

The `setter` decorator lets you declare a write-only property.

```ts {5}
@register()
class MyObj extends GObject.Object {
  #prop = ""

  @setter(String)
  set myProp(value: string) {
    if (value !== this.#prop) {
      this.#prop = value
      this.notify("my-prop")
    }
  }
}
```

> [!NOTE]
>
> When using `setter` you will have to explicitly emit the notify signal.

<!--  -->

> [!TIP]
>
> You can use the `setter` and `getter` decorators in combination to declare a
> read-write property.

## Signal decorator

```ts
function signal(
  params: Array<GType>,
  returnType?: GType,
  options?: {
    default?: default
    flags?: SignalFlags
    accumulator?: AccumulatorType
  },
)

function signal(...params: Array<GType>)
```

You can apply the signal decorator to a method where the method is the default
handler of the signal.

```ts {3,4,5,10}
@register()
class MyObj extends GObject.Object {
  @signal([String, Number], Boolean, {
    default: true,
    accumulator: GObject.AccumulatorType.FIRST_WINS,
  })
  myFirstHandledSignal(str: string, n: number): boolean {
    return false
  }

  @signal(String, GObject.TYPE_STRING)
  mySignal(a: string, b: string): void {
    // default signal handler
  }
}
```

> [!TIP]
>
> It is required to provide a function implementation which becomes the default
> signal handler. In case you don't want to implement a default handler you can
> set the `default` option to `false`.
>
> ```ts
> class {
>   @signal([], Boolean, {
>     default: false,
>   })
>   withoutDefaultImpl(): boolean {
>     throw "this never runs"
>   }
> }
> ```

You can emit the signal by calling the signal method or using `emit`.

```ts
const obj = new MyObj()
obj.connect("my-signal", (obj, a: string, b: string) => {})

obj.mySig("a", "b")
obj.emit("my-signal", "a", "b")
```

> [!TIP]
>
> To make the `connect` method aware of signals, you can override it.
>
> ```ts
> interface MyObjSignals extends GObject.Object.SignalSignatures {
>   "my-signal": MyObj["mySignal"]
> }
>
> @register()
> class MyObj extends GObject.Object {
>   declare $signals: MyObjSignals // this makes signals inferable in JSX
>
>   override connect<S extends keyof MyObjSignals>(
>     signal: S,
>     callback: GObject.SignalCallback<this, MyObjSignals[S]>,
>   ): number {
>     return super.connect(signal, callback)
>   }
> }
> ```

## Register decorator

Every `GObject.Object` subclass has to be registered. You can pass the same
options to this decorator as you would to `GObject.registerClass`.

```ts
@register({ GTypeName: "MyObj" })
class MyObj extends GObject.Object {}
```

> [!TIP]
>
> This decorator registers properties and signals defined with decorators, so
> make sure to use this and **not** `GObject.registerClass` if you define any.
