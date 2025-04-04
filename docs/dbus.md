# DBus decorators

> [!WARNING]
> This is an experimental feature.

Decorators that make it possible to generate interface definitions from classes.

Read more about using DBus in GJS on [gjs.guide](https://gjs.guide/guides/gio/dbus.html).

## Example client usage

```ts client.ts
import * as dbus from "gjsx/dbus"

@dbus.iface("my.service.interface")
class MyService {
    @dbus.method("s", { type: "s", direction: "out" })
    declare MyMethod: (param1: string) => void

    // proxy.MyMethod is undefined at runtime
    // gjs binds a sync and async version with suffixes
    declare MyMethodSync: (param1: string) => void
    declare MyMethodAsync: (param1: string) => Promise<void>

    @dbus.signal("s", "i")
    declare MySignal: (param1: string, param2: number) => void

    @dbus.property("s", "readwrite")
    declare MyProp: string
}

const proxy = await dbus.proxyAsync(MyService, {
    name: "my.service.domain",
    path: "/my/service/object",
})

proxy.connect("g-signal", (_, _name, signal, params) => {
    if (signal === "MySignal") {
        const [param1, param2] = params.deepUnpack() as [string, number]
        print(param1, param2)
    }
})

proxy.connect("g-properties-changed", (_, changed) => {
    print(changed.deepUnpack())
})

print(proxy.MyMethodSync("hello"))
print(await proxy.MyMethodAsync("hello"))
proxy.MyProp = "new value"
```

## Example service implementation

It is possible to use these decorators in combination with [gobject decorators](./gobject).

```ts service.ts
import * as g from "gjsx/gobject"
import * as dbus from "gjsx/dbus"

@g.register({ GTypeName: "MyService" })
@dbus.iface("my.service.interface")
class MyService extends g.Object {
    declare private _myProp: string

    // will be available after construction with `dbus.serve`
    declare dbusObject: dbus.DBusObject

    @dbus.method("s", { type: "s", direction: "out" })
    MyMethod(param1: string) {
        print("MyMethod called")
        return param1
    }

    @g.signal(String, Number)
    @dbus.signal("s", "i")
    MySignal(param1: string, param2: number) {
        print("MySignal", param1, param2)
    }

    @g.property(String)
    @dbus.property("s")
    set MyProp(value: string) {
        // when using both dbus and gobject decorators
        // prop notification has to be done explicitly
        if (this.MyProp !== value) {
            this._myProp = value

            // notify gobject instance
            this.notify("my-prop")

            // notify dbus
            this.dbusObject.emit_property_changed(
                "MyProp",
                new dbus.Variant("s", value),
            )
        }
    }

    get MyProp(): string {
        return this._myProp ?? ""
    }
}

const service = await dbus.serveAsync(MyService, {
    name: "my.service.domain",
    path: "/my/service/object",
})

service.connect("my-signal", (_, param1: string, param2: number) => {
    print(param1, param2)
})

service.connect("notify::my-prop", ({ MyProp }: MyService) => {
    print(MyProp)
})

service.MySignal("hello", 1234)
service.MyProp = "new value"
```
