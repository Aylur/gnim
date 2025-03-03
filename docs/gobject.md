# GObject decorators

Decorators that wrap [`GObject.registerClass`](https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/Overrides.md?ref_type=heads#gobjectregisterclassmetainfo-klass).

## Example Usage

```ts
import GObject, { register, property } from "gjsx/gobject"

@register({ GTypeName: "MyObj" })
class MyObj extends GObject.Object {
    @property(String)
    declare myProp: string

    @signal(String, GObject.TYPE_UINT)
    declare mySignal: (a: string, b: number) => void
}
```

## Property decorator

```ts
type PropertyDeclaration =
    | { $gtype: GObject.GType }
    | ((name: string, flags: GObject.ParamFlags) => GObject.ParamSpec)

function property(declaration: PropertyDeclaration)
```

The `property` decorator takes one of

- any class that has a registered `GType`. This includes the globally available `String`, `Number`, `Boolean` and `Object` JavaScript constructors which are mapped to their relative `GObject.ParamSpec`.
  - `Object`: `ParamSpec.jsobject`
  - `String`: `ParamSpec.string`
  - `Number`: `ParamSpec.double`
  - `Boolean`: `ParamSpec.boolean`

  ```ts
  @register()
  class MyObj extends GObject.Object {
      @property(String) declare myProp: string
      @property(MyObj) declare myProp2: MyObj
  }
  ```

- a function that produces a `ParamSpec`: the passed name is a kebab-cased name of the property, for example `myProp` -> `my-prop` and flags is either `ParamFlags.READABLE`, `ParamFlags.WRITABLE` or `ParamFlags.READWRITE`

  ```ts
  const Percent = (name: string, flags: GObject.ParamFlags) => (
      GObject.ParamSpec.double(name, "", "", flags, 0, 1, 0)
  )

  @register()
  class MyObj extends GObject.Object {
      @property(Percent) declare percent: number
  }
  ```

The property decorator can be applied in the following ways:

1. On a property declaration

```ts {3,4}
@register()
class MyObj extends GObject.Object {
    @property(String)
    declare myProp: string
}
```

This will create a getter and setter for the property and will also
emit the notify signal when the value is set to a new value.

> [!INFO]
> The `declare` keyword is required if the property is not set in the constructor.
> or if its set with `super()`.

> [!WARNING]
> The value is checked by reference, this is important if your
> property is an object type.
>
> ```ts
> const dict = obj.prop
> dict["key"] = 0
> obj.prop = dict // This will not emit notify::prop // [!code error]
> obj.prop = { ...dict } // This will emit notify::prop
> ```

If you want to set a custom default value, you can do so in the `super` constructor of your class.

```ts {7}
@register()
class MyObj extends GObject.Object {
    @property(String)
    declare myProp: string

    constructor() {
        super({ myProp: "default-value" } as any)
    }
}
```

> [!NOTE]
> `super` is not correctly typed for this usecase however.
> In most cases you can just set the property after to satisfy TypeScript
> in which case you can also drop `declare`.
>
> ```ts {6,7,8}
> @register()
> class MyObj extends GObject.Object {
>     @property(String)
>     myProp: string
> 
>     constructor({ myProp = "default-value" }: { myProp: string }) {
>         super()
>         this.myProp = myProp
>     }
> }
> ```

2. On a single getter or a single setter

```ts {3,4}
@register()
class MyObj extends GObject.Object {
    @property(String)
    get readOnly() {
        return "readonly value"
    }

    @property(String)
    get writeOnly(value: string) {
        // setter logic
        this.notify("write-only")
    }
}
```

This will create a read-only / write-only property.

> [!TIP]
> When defining setters, `notify` signal emission has to be done explicitly.

3. On a getter and setter

```ts {5,6,10}
@register()
class MyObj extends GObject.Object {
    declare private _prop: string

    @property(String)
    get myProp () {
        return "value"
    }

    set myProp (v: string) {
        if (v !== this._prop) {
            this._prop = v
            this.notify("my-prop")
        }
    }
}
```

This will create a read-write property.

> [!TIP]
> The decorator has to be used on either the setter or getter, but **not both**.

## Signal decorator

```ts
function signal(...params: Array<{ $gtype: GObject.GType } | GObject.GType>)

function signal(declaration?: SignalDeclaration) // Object you would pass to GObject.registerClass
```

You can apply the signal decorator to either a property declaration or a method.

```ts {3,4,6,7}
@register()
class MyObj extends GObject.Object {
    @signal(GObject.TYPE_STRING, GObject.TYPE_STRING)
    declare mySig: (a: String, b: String) => void

    @signal(String, String)
    mySig(a: string, b: string) {
        // default signal handler
    }
}
```

You can emit the signal by calling the signal method or using `emit`.

```ts
const obj = new MyObj()
obj.connect("my-sig", (obj, a: string, b: string) => {})

obj.mySig("a", "b")
obj.emit("my-sig", "a", "b")
```

## Register decorator

Every GObject subclass has to be registered. You can pass the same options
to this decorator as you would to `GObject.registerClass`

```ts
@register({ GTypeName: "MyObj" })
class MyObj extends GObject.Object {
}
```

> [!TIP]
> This decorator registers properties and signals defined with decorators,
> so make sure to use this and **not** `GObject.registerClass` if you define any.
