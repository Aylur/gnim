# Writing an Application

So far this tutorial used a simple `GLib.MainLoop` to display Gtk Widgets which
works, but it does not let you integrate your app into the desktop. No way to
name your app and launching the script will simply open a new window. This is
where `Gtk.Application` comes in, which does most of the heavy lifting.

> [!TIP]
>
> In case you are writing an Adwaita application you want to use
> `Adw.Application`.

## `Gtk.Application`

To use `Gtk.Application`, you can either create an instance and connect signal
handlers, or create a subclass and implement its methods.

::: code-group

```ts [Subclassing]
import Gtk from "gi://Gtk?version=4.0"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { register } from "gnim/gobject"
import { render } from "gnim/gtk4"
import { programInvocationName, programArgs } from "system"

@register
class MyApp extends Gtk.Application {
  constructor() {
    super({
      applicationId: "com.example.MyApp",
      flags: Gio.ApplicationFlags.FLAGS_NONE,
    })

    GLib.set_prgname("example-myapp")
    GLib.set_application_name("My App")
  }

  vfunc_activate(): void {
    const dispose = render(() => {
      // show windows here
    }, this)

    this.connect("shutdown", dispose)
  }
}

export const app = new MyApp()
app.runAsync([programInvocationName, ...programArgs])
```

```ts [Without subclassing]
import Gtk from "gi://Gtk?version=4.0"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { render } from "gnim/gtk4"
import { programInvocationName, programArgs } from "system"

GLib.set_prgname("example-myapp")
GLib.set_application_name("My App")

export const app = new Gtk.Application({
  applicationId: "com.example.MyApp",
  flags: Gio.ApplicationFlags.FLAGS_NONE,
})

app.connect("activate", () => {
  const dispose = render(() => {
    app.connect("shutdown", dispose)
    // show windows here
  }, app)
})

app.runAsync([programInvocationName, ...programArgs])
```

:::

> [!TIP]
>
> [Application ID](https://developer.gnome.org/documentation/tutorials/application-id.html)
> should be in reverse DNS style.

The main benefit of using an application is that in most cases you want a single
instance of your app running and every subsequent invocation to do something on
this main instance. For example, when your app is already running, and the user
clicks on the app icon in a status panel/dock you want your window to reappear
on screen instead of launching another instance.

```tsx
class MyApp extends Gtk.Application {
  declare window?: Gtk.Window

  vfunc_activate(): void {
    if (this.window) {
      return this.window.present()
    }

    const dispose = render(() => {
      this.connect("shutdown", dispose)

      effect(() => {
        this.window.present()
      })

      return (
        <Gtk.Window application={this} ref={(self) => (this.window = self)} />
      )
    })
  }
}
```

## Application Settings

If you want to persist some data, for example some setting values, Gtk provides
you the [Gio.Settings](https://docs.gtk.org/gio/class.Settings.html) API which
is a way to store key value pairs in a predefined schema. Gnim provides a
type-safe wrapper over this API which during development will automatically
compile the store and provide it to GJS.

First, define a schema in `<app-id>.gschema.ts`, for example
`com.example.MyApp.gschema.ts`.

```ts
import GLib from "gi://GLib?version=2.0"
import { defineSchemaList, Schema, Enum, Flags } from "gnim/schema"

const myFlags = new Flags("my.flags", ["one", "two"])
const myEnum = new Enum("my.enum", ["one", "two"])

export const schema = new Schema({
  id: "com.example.MyApp",
  path: "/com/example/myapp/",
})
  .key("my-key", "s", {
    default: "",
    summary: "Simple string key",
  })
  .key("complex-key", "a{sv}", {
    default: {
      key: GLib.Variant.new("s", "value"),
    },
    summary: "Variant dict key",
  })
  .key("enum-key", myEnum, {
    default: "one",
  })
  .key("flags-key", myFlags, {
    default: ["one", "two"],
  })

export default defineSchemaList([schema])
```

> [!NOTE]
>
> [`GLib.Variant`](/article/gvariant) is GLib's serialized format similar to
> JSON but with types.

You can then instantiate a settings object with
[`createSettings`](/reference/schemas#using-schemas) which returns an object
with a setter and Accessor pair for each key.

```ts
import { schema } from "./com.example.MyApp.gschema"

const settings = createSettings(schema)

effect(() => {
  console.log(settings.myKey())
})

settings.setMyKey("new value")
```

## Exposing a D-Bus interface

If you want other apps or processes to communicate with your application, the
standard way to do IPC on Linux is via D-Bus. Gnim offers a convenient
[decorator API](/reference/dbus) that lets you easily implement services for
your app through D-Bus.

At a very high level, D-Bus lets you export _objects_ that have _interfaces_ on
a system bus, identified by a _name_.

You can read more about D-Bus in detail on
[freedesktop.org](https://www.freedesktop.org/wiki/Software/dbus/) or check out
[gjs.guide](https://gjs.guide/guides/gio/dbus.html), which covers it at a
slightly lower level.

> [!TIP]
>
> Use [D-Spy](https://flathub.org/apps/org.gnome.dspy) to introspect D-Bus on
> your desktop.

First define an interface.

```ts
import { Service, iface, method } from "gnim/dbus"

@iface("com.example.MyApp.MyService")
class MyService extends Service {
  @method("s") MyMethod(arg: string) {
    console.log("MyMethod has been invoked: ", arg)
  }
}
```

Then instantiate it and export it.

```ts
@register
class MyApp extends Gtk.Application {
  private service: MyService

  constructor() {
    super({ applicationId: "com.example.MyApp" })
    this.service = new MyService()
  }

  vfunc_shutdown(): void {
    super.vfunc_shutdown()
    this.service.stop()
  }

  vfunc_activate(): void {
    this.service.serve({
      name: "com.example.MyApp",
      objectPath: "/com/example/MyApp/MyService",
    })
  }
}
```

Now you can invoke this from other processes.

```sh
gdbus call \
  --session \
  --dest com.example.MyApp \
  --object-path /com/example/MyApp/MyService \
  --method com.example.MyApp.MyService.MyMethod \
  'Hello World!'
```
