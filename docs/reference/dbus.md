# DBus

Utilities for declaring DBus interfaces and using them as services or client
proxies in a fully typed manner.

Read more about using DBus in GJS on
[gjs.guide](https://gjs.guide/guides/gio/dbus.html).

## Example usage

Declare an interface

```ts
import { createDBusInterface, property, method, signal } from "gnim/dbus"

const MyInterface = createDBusInterface("example.gjs.MyInterface", {
  MyProperty: property("s"),
  MyMethod: method(["s"], ["s"]),
  MySignal: signal("s"),
})
```

Use it as a service

```ts
const service = await MyInterface.serve({
  name: "example.gjs.MyInterface",
  objectPath: "/example/gjs/MyInterface",
  implementation: (emitter) => ({
    MyProperty: "initial value",
    MyMethod(str): [string] {
      emitter.MySignal(str)
      return [str]
    },
  }),
})

service.connect("my-signal", (_, str: string) => {
  console.log(`MySignal emitted with argument: "${str}"`)
})

service.connect("notify::my-property", () => {
  console.log(`MyProperty set to ${service.MyProperty}`)
})
```

Use it as a proxy

```ts
const proxy = await MyInterface.proxy({
  name: "example.gjs.MyInterface",
  objectPath: "/example/gjs/MyInterface",
})

proxy.connect("my-signal", (_, str: string) => {
  console.log(`MySignal emitted with argument: "${str}"`)
})

proxy.connect("notify::my-property", () => {
  console.log(`MyProperty set to ${service.MyProperty}`)
})

proxy.MyProperty = "new value"

const [value] = await proxy.MyMethod("hello")
console.log(value) // "hello"
```

Both services and proxies are `GObject.Object` instances: DBus signals are also
GObject signals and DBus properties are also GObject properties, using
kebab-cased names.

## `createDBusInterface`

Declares a DBus interface from which both services and proxies can be created.

```ts
function createDBusInterface<T extends InterfaceDeclaration>(
  name: string,
  interfaceDeclaration: T,
): DBusInterface<T>

interface DBusInterface<T extends InterfaceDeclaration> {
  serve(props: ServeProps<T>): Promise<ServiceInstance<T>>
  proxy(props?: ProxyProps): Promise<ProxyInstance<T>>
}
```

## `property`

Declares a DBus property with a [variant type string](/article/gvariant).

```ts
function property(type: string, access?: "r" | "w" | "rw")
```

Properties are read-write by default. Pass `"r"` to declare a read-only or `"w"`
to declare a write-only property, which is reflected in the types of the service
implementation and the proxy.

## `method`

Declares a DBus method.

```ts
type Arg = string | { name: string; type: string }

function method(...inArgs: Arg[])
function method(inArgs: Arg[], outArgs: Arg[])
```

Return values are declared as a list of out arguments, which implementations
return and proxies resolve as a tuple.

> [!NOTE]
>
> Optionally, you can declare the name of the arguments for DBus inspection by
> passing a `{ name: string, type: string }` object instead of just the type
> string.
>
> ```ts
> method([{ name: "str", type: "s" }], ["s"])
> ```

## `signal`

Declares a DBus signal.

```ts
type Arg = string | { name: string; type: string }

function signal(...args: Arg[])
```

Unlike GObject signals, DBus signals do not have return types.

## `serve`

Attempts to own `name` and export an object implementing the interface at
`objectPath` on `busType`.

```ts
interface DBusInterface<T extends InterfaceDeclaration> {
  serve(props: {
    busType?: Gio.BusType // default: Gio.BusType.SESSION
    name?: string // default: the interface name
    objectPath?: string // default: the interface name as a path
    flags?: Gio.BusNameOwnerFlags // default: Gio.BusNameOwnerFlags.NONE
    timeout?: number // default: 10_000
    implementation: (emitter: ServiceEmitter<T>) => ServiceImplementation<T>
  }): Promise<ServiceInstance<T>>
}
```

The returned promise rejects if the name is already owned by another process,
the connection could not be established or `timeout` milliseconds elapsed.

The `implementation` factory receives an `emitter` object, which has a notifier
function for each readable property and an emitter function for each signal, and
returns the object implementing the interface.

### Implementing properties

Read-write properties can be implemented either as plain data properties or as
getter/setter pairs. Changes to data properties are detected automatically,
while getters/setters have to notify through the `emitter`. Read-only properties
are implemented with a getter and write-only properties with a setter.

```ts
const service = await MyInterface.serve({
  implementation: (emitter) => ({
    // data property: assignments automatically emit
    // PropertiesChanged and notify:: when the value changes
    MyProperty: "initial value",

    // getter/setter property: has to emit manually
    get MyOtherProperty() {
      return internalValue
    },
    set MyOtherProperty(value: string) {
      internalValue = value
      emitter.MyOtherProperty()
      emitter.ReadOnlyProperty()
    },

    // read-only property
    get ReadOnlyProperty() {
      return this.MyOtherProperty + "ReadOnly"
    },

    // write-only property
    set WriteOnlyProperty(value: number) {
      writeOnlyValue = value
    },
  }),
})
```

### Implementing methods

Methods take their in arguments as parameters and return their out arguments as
a tuple, either synchronously or as a `Promise`. Methods with no out arguments
return nothing.

```ts
const service = await MyInterface.serve({
  implementation: (emitter) => ({
    MySyncMethod(str): [string] {
      return [str]
    },
    async MyAsyncMethod(str): Promise<[string]> {
      await somethingAsync()
      return [str]
    },
  }),
})
```

Thrown errors are returned to the caller as DBus errors.

### The service object

The object resolved by `serve` is a `GObject.Object` exposing the interface.

- Its properties read and write through the implementation and enforce access
  flags: reading a write-only or assigning a read-only property throws.
  Assigning a data property automatically emits `PropertiesChanged` and
  `notify::` just like a remote write does.
- Its methods invoke the implementation directly.
- DBus signals and property changes are also emitted as GObject signals, which
  can be connected to with their kebab-cased names, such as `my-signal` or
  `notify::my-property`.

```ts
class ServiceInstance extends GObject.Object {
  implementation: ServiceImplementation<T>
  unexport(): void
}
```

Serving stops with `unexport`, which also releases the owned name.

## `proxy`

Attempts to proxy `name`'s object at `objectPath` on the `bus` connection.

```ts
interface DBusInterface<T extends InterfaceDeclaration> {
  proxy(props?: {
    bus?: Gio.DBusConnection // default: Gio.DBus.session
    name?: string // default: the interface name
    objectPath?: string // default: the interface name as a path
    flags?: Gio.DBusProxyFlags // default: Gio.DBusProxyFlags.NONE
    timeout?: number // default: 10_000
  }): Promise<ProxyInstance<T>>
}
```

- Property reads are served from a cache which is kept in sync through
  `PropertiesChanged` signals. If a value is missing from the cache, it is
  fetched with a blocking call.
- Property writes update the cache optimistically and set the remote property
  asynchronously. If the remote write fails, the cached value is rolled back.
- Methods are invoked asynchronously and resolve their out arguments as a tuple,
  or an empty tuple for methods without out arguments. They reject with a
  `GLib.Error` if the remote implementation throws.
- DBus signals and property changes are emitted as GObject signals, which can be
  connected to with their kebab-cased names, such as `my-signal` or
  `notify::my-property`.

## Type helpers

`InferImplementation`, `InferEmitter` and `InferProxy` extract the
implementation, emitter and proxy types of a declared interface, which is useful
for implementing services as classes.

```ts
import { type InferEmitter, type InferImplementation } from "gnim/dbus"

type Emitter = InferEmitter<typeof MyInterface>

class Implementation implements InferImplementation<typeof MyInterface> {
  private emitter: Emitter

  constructor(emitter: Emitter) {
    this.emitter = emitter
  }

  MyProperty = "initial value"

  MyMethod(str: string): [string] {
    this.emitter.MySignal(str)
    return [str]
  }
}

const service = await MyInterface.serve({
  implementation: (emitter) => new Implementation(emitter),
})
```

## Lower level API

`createDBusInterface` is built on top of `createInterfaceInfo`, which turns a
declaration into a `Gio.DBusInterfaceInfo`, and `createServiceClass` and
`createProxyClass`, which create `GObject.Object` subclasses from it. These are
also exported from `gnim/dbus` for cases that need manual control over
instantiation, initialization or exporting.

```ts
function createInterfaceInfo<T extends InterfaceDeclaration>(
  name: string,
  interfaceDeclaration: T,
): InterfaceInfo<T>

function createServiceClass<T extends InterfaceDeclaration>(
  info: InterfaceInfo<T>,
): ServiceClass<T>

function createProxyClass<T extends InterfaceDeclaration>(
  info: InterfaceInfo<T>,
): ProxyClass<T>
```
