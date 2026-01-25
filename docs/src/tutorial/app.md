# Writing an Application

So far this tutorial used a simple `GLib.MainLoop` to display Gtk Widgets which
works, but it does not let you integrate your app into the desktop. No way to
name your app and launching the script will simply open a new window. This is
where `Gtk.Application` comes in, which does most of the heavy lifting.

> [!TIP]
>
> In case you are writing an Adwiata application you want to use
> `Adw.Application`.

## `Gtk.Application`

To use `Gtk.Application`, you can either create an instance and connect signal
handlers, or create a subclass and implement its methods.

::: code-group

```ts [Subclassing]
import Gtk from "gi://Gtk"
import Gio from "gi://Gio"
import { register } from "./gobject"
import { createRoot } from "./jsx/scope"
import { programInvocationName, programArgs } from "system"

@register()
class MyApp extends Gtk.Application {
  constructor() {
    super({
      applicationId: "my.awesome.app",
      flags: Gio.ApplicationFlags.FLAGS_NONE,
    })
  }

  vfunc_activate(): void {
    createRoot((dispose) => {
      this.connect("shutdown", dispose)
      // show windows here
    })
  }
}

export const app = new MyApp()
app.runAsync([programInvocationName, ...programArgs])
```

```ts [Without subclassing]
import Gtk from "gi://Gtk"
import Gio from "gi://Gio"
import { createRoot } from "./jsx/scope"
import { programInvocationName, programArgs } from "system"

export const app = new Gtk.Application({
  applicationId: "my.awesome.app",
  flags: Gio.ApplicationFlags.NON_UNIQUE,
})

app.connect("activate", () => {
  createRoot((dispose) => {
    app.connect("shutdown", dispose)
    // show windows here
  })
})

app.runAsync([programInvocationName, ...programArgs])
```

:::

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

    createRoot((dispose) => {
      this.connect("shutdown", dispose)

      return <Gtk.Window $={(self) => (this.window = self).present()} />
    })
  }
}
```

## Application Settings

If you want to persist some data, for example some setting values, Gtk provides
you the [Gio.Settings](https://docs.gtk.org/gio/class.Settings.html) API which
is a way to store key value pairs in a predefined schema.

First you have to define a schema in XML format named `<id>.gschema.xml` so in
our case `my.awesome.app.gschema.xml`.

```xml
<schemalist>
  <schema path="/my/awesome/app/" id="my.awesome.app">
    <key name="simple-string" type="s">
      <default>'default value in gvariant serialized format'</default>
    </key>
    <key name="string-dictionary" type="a{ss}">
      <default>
        <![CDATA[
          {
            'key1': 'value1',
            'key2': 'value2'
          }
        ]]>
      </default>
    </key>
  </schema>
</schemalist>
```

Then you have to install it to `<prefix>/<datadir>/glib-2.0/schemas` which is
usually `/usr/share/glib-2.0/schemas`. As a last step you have to compile it
before writing/reading it.

```sh
cp my.awesome.app.gschema.xml /usr/share/glib-2.0/schemas
glib-compile-schemas /usr/share/glib-2.0/schemas
```

> [!TIP]
>
> You usually don't install it manually. Instead, you do it as part of your
> build and install phase using a build tool such as meson as shown in the
> [packaging](./packaging) section.

You can then create a `Gio.Settings` and optionally wrap it in a
[`createSettings`](../jsx#createsettings).

```ts
const settings = new Gio.Settings({ schemaId: "my.awesome.app" })

const { simpleString, setSimpleString } = createSettings(settings, {
  "simple-string": "s",
  "string-dictionary": "a{ss}",
})

console.log(simpleString.get())
setSimpleString("new value")
```

## Exposing a D-Bus interface

If you want other apps or processes to communicate with your application, the
standard way to do IPC on Linux is via D-Bus. Gnim offers a convenient
[decorator API](../dbus) that lets you easily implement interfaces for your app
through D-Bus.

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

@iface("my.awesome.app.MyService")
class MyService extends Service {
  @method("s") MyMethod(arg: string) {
    console.log("MyMethod has been invoked: ", arg)
  }
}
```

Then instantiate it and export it.

```ts
@register()
class MyApp extends Gtk.Application {
  private service: MyService

  constructor() {
    super({ applicationId: "my.awesome.app" })
    this.service = new MyService()
  }

  vfunc_shutdown(): void {
    super.vfunc_shutdown()
    this.service.stop()
  }

  vfunc_activate(): void {
    this.service.serve({
      name: "my.awesome.app",
      objectPath: "/my/awesome/app/MyService",
    })
  }
}
```

Now you can invoke this from other processes.

```sh
gdbus call \
  --session \
  --dest my.awesome.app \
  --object-path /my/awesome/app/MyService \
  --method my.awesome.app.MyService.MyMethod \
  'Hello World!'
```
