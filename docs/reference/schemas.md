# Schemas

A type-safe abstraction over
[Gio.Settings](https://docs.gtk.org/gio/class.Settings.html).

```ts
import {
  createSettings,
  defineSchemaList,
  Enum,
  Flags,
  Schema,
} from "gnim/schema"
```

## Defining schemas

Using the `Schema` class you can use the builder pattern to define schemas.

```ts
const schema = new Schema({
  id: "com.example.MyApp",
  path: "/com/example/MyApp/",
})
  .key("my-key", "s", {
    summary: "Simple string key",
    default: "",
  })
  .key("complex-key", "a{sv}", {
    summary: "Variant dict key",
    default: {
      key: GLib.Variant.new("s", "value"),
    },
  })

export default defineSchemaList([schema])
```

Running `gnim schemas ./path/to/directory` will turn each file in the directory
with `.gschema.ts` extension into a corresponding `.gschema.xml` file which then
can be integrated into build pipelines, for example
[Meson](/tutorial/packaging#meson).

```xml
<schemalist>
  <schema id="com.example.MyApp" path="/com/example/MyApp/">
    <key name="my-key" type="s">
      <summary>Simple string key</summary>
      <default><![CDATA[ '' ]]></default>
    </key>
    <key name="complex-key" type="a{sv}">
      <summary>Variant dict key</summary>
      <default><![CDATA[ {'key': <'value'>} ]]></default>
    </key>
  </schema>
</schemalist>
```

## Using schemas

```ts
function createSettings<S extends Schema>(schema: S): SchemaSettings<S>

function createSettings<S extends Schema>(
  settings: Gio.Settings,
  schema: S,
): SchemaSettings<S>

function createSettings<const T extends Record<string, string>>(
  settings: Gio.Settings,
  record: T,
): Settings<T>
```

The `createSettings` function can consume schemas and turn them into objects
that will have an Accessor and setter function for each defined key.

```ts
import { schema } from "./com.example.MyApp.gschema"
import { createSettings } from "gnim/schema"

const settings = createSettings(schema)

console.log(settings.myKey.peek())
settings.setMyKey("new value")
```

Optionally, you can pass an existing `Gio.Settings` object.

```ts
import { createSettings } from "gnim/schema"

const gioSettings: Gio.Settings
const settings = createSettings(gioSettings, schema)
```

If you are going to use an existing system-installed schema where you only care
about the types, you can use a simple schema definition.

```ts
import { createSettings } from "gnim/schema"

const gioSettings: Gio.Settings

const settings = createSettings(gioSettings, {
  "my-key": "s",
})
```
