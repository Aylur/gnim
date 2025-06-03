# DBus decorators

Read more about using DBus in GJS on
[gjs.guide](https://gjs.guide/guides/gio/dbus.html).

Use classes to define an interface.

```ts
import { Service, iface, methodAsync, signal, property } from "gjsx/dbus"

@iface("example.gjsx.MyService")
export class MyService extends Service {
    @property("s") MyProperty = ""

    @methodAsync(["s"], ["s"])
    async MyMethod(str: string): Promise<[string]> {
        this.MySignal(str)
        return [str]
    }

    @signal("s")
    MySignal(str: string) {}
}
```

> [!NOTE]
>
> Optionally, you can declare the name of the arguments for DBus inspection by
> passing a `{ name: string, type: string }` object as the parameter to the
> decorators instead of just the type string.

Use them as servers

```ts
const service = await new MyService().serve()

service.connect("my-signal", (_, str: string) => {
    console.log(`MySignal invoked with argument: "${str}"`)
})

service.connect("notify::my-property", () => {
    console.log(`MyProperty set to ${service.MyProperty}`)
})
```

Use them as proxies

```ts
const proxy = await new MyService().proxy()

proxy.MyProperty = "new value"

const value = await proxy.MyMethod("hello")
console.log(value) // "hello"
```

## `Service`

Base class of every DBus service for both proxies and exported objects. Derived
from `GObject.Object`. DBus signals are also GObject signals and DBus properties
are also GObject properties.

```ts
import { Service, iface } from "gjsx/dbus"

@iface("example.gjsx.MyService")
class MyService extends Service {}
```

### `serve`

Attempt to own `name` and export this object at `objectPath` on `busType`.

```ts
class Service {
    async serve(props: {
        busType?: Gio.BusType
        name?: string
        objectPath?: string
        flags?: Gio.BusNameOwnerFlags
        timeout?: number
    }): Promise<this>
}
```

### `proxy`

Attempt to proxy `name`'s object at `objectPath` on `busType`.

```ts
class Service {
    async proxy(props: {
        bus?: Gio.DBusConnection
        name?: string
        objectPath?: string
        flags?: Gio.DBusProxyFlags
        timeout?: number
    }): Promise<this>
}
```

Method, signal and property access implementations are ignored. When acting as a
proxy they work over the remote object.

Exmaple

```ts
@iface("some.dbus.interface")
class MyProxy extends Service {
    @method()
    Method() {
        console.log("this is never invoked when working as a proxy")
    }
}

const proxy = await new MyProxy().proxy()

proxy.Method()
```

## `method`

Registers a DBus method.

```ts
type Arg = string | { name: string; type: string }

function method(inArgs: Arg[], outArgs: Arg[])

function method(...inArgs: Arg[])
```

Example

```ts
class {
    @method("s", "i")
    Simple(arg0: string, arg1: number): void {}

    @method(["s", "i"], ["s"])
    SimpleReturn(arg0: string, arg1: number): [string] {
        return ["return valule"]
    }
}
```

> [!TIP]
>
> When writing an interface to be used as a proxy prefer using
> [methodAsync](./dbus#methodAsync) instead as it does not block IO.

## `methodAsync`

Async version of the `method` decorator which is useful for proxies.

```ts
type Arg = string | { name: string; type: string }

function methodAsync(inArgs: Arg[], outArgs: Arg[])

function methodAsync(...inArgs: Arg[])
```

Example

```ts
class {
    @methodAsync("s", "i")
    async Simple(arg0: string, arg1: number): Promise<void> {}

    @methodAsync(["s", "i"], ["s"])
    async SimpleReturn(arg0: string, arg1: number): Promise<[string]> {
        return ["return valule"]
    }
}
```

> [!NOTE]
>
> On exported objects this is functionally the same as [method](./dbus#method)

## `property`

Registers a property, similarly to the
[gobject property](./gobject#property-decorator) decorator. Except that it works
over `Variant` types.

```ts
function property(type: string)
```

```ts
class {
    @property("s") Value = "value"
}
```

## `getter`

Registers a read-only property, similarly to the
[gobject](./gobject#property-decorator) getter decorator.

```ts
function getter(type: string)
```

```ts
class {
    @getter("s")
    get Value() { return "" }
}
```

> [!TIP]
>
> Can be used in combination with the `setter` decorator to define read-write
> properties

## `setter`

Registers a write-only property, similarly to the
[gobject](./gobject#property-decorator) setter decorator.

```ts
function setter(type: string)
```

```ts
class {
    @setter("s")
    set Value(value: string) { }
}
```

> [!TIP]
>
> Can be used in combination with the `getter` decorator to define read-write
> properties

## `signal`

Registers a DBus signal.

```ts
type Param = string | { name: string; type: string }

function method(...parameters: Param[])
```

Example

```ts
class {
    @signal("s", "i")
    MySignal(arg0: string, arg1: number) {}
}
```
