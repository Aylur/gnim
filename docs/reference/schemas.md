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
export const schema = new Schema({
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

The `createSettings` function can understand schemas and turn them into objects
that will have an Accessor and setter function for each defined key.

```ts
import { schema } from "./com.example.MyApp.gschema"
import { createSettings } from "gnim/schema"

const settings = createSettings(schema)

effect(() => {
  console.log(settings.myKey())
})

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

## Relocatable schemas

A schema without a `path` is
[relocatable](https://docs.gtk.org/gio/class.Settings.html#relocatable-schemas):
it can be instantiated at any number of paths, which is useful when the same set
of keys has to be stored multiple times, for example once per profile or per
account. To define one, omit the `path` property.

```ts
export const profileSchema = new Schema({ id: "com.example.MyApp.Profile" })
  //
  .key("name", "s", {
    summary: "Name of the profile",
    default: "",
  })
```

```xml
<schemalist>
  <schema id="com.example.MyApp.Profile">
    <key name="name" type="s">
      <summary>Name of the profile</summary>
      <default><![CDATA[ '' ]]></default>
    </key>
  </schema>
</schemalist>
```

> [!NOTE] Passing a string to the `Schema` constructor derives the path from the
> id, so only the object form without `path` produces a relocatable schema.

Since a relocatable schema has no path of its own, it cannot be instantiated
with `createSettings(schema)` directly. Create a `Gio.Settings` with an explicit
`path` and pass that in instead.

```ts
import Gio from "gi://Gio?version=2.0"
import { createSettings } from "gnim/schema"
import { profileSchema } from "./com.example.MyApp.Profile.gschema"

const profile = createSettings(
  new Gio.Settings({
    schemaId: profileSchema.id,
    path: "/com/example/MyApp/profiles/0/",
  }),
  profileSchema,
)

profile.setName("Work")
```

### Managing instances

GSettings cannot enumerate the paths a relocatable schema has been instantiated
at, so you have to keep track of them yourself. A common pattern is a "manager"
key in a regular schema that stores the list of instances.

```ts
export const managerSchema = new Schema("com.example.MyApp")
  //
  .key("profiles", "as", {
    summary: "List of profile ids",
    default: [],
  })

export const profileSchema = new Schema({ id: "com.example.MyApp.Profile" })
  //
  .key("name", "s", {
    summary: "Name of the profile",
    default: "",
  })

export default defineSchemaList([managerSchema, profileSchema])
```

```ts
const manager = createSettings(managerSchema)

function profileGioSettings(id: string) {
  return new Gio.Settings({
    schemaId: profileSchema.id,
    path: `/com/example/MyApp/profiles/${id}/`,
  })
}

function addProfile(id: string) {
  manager.setProfiles((prev) => [...prev, id])
  return createSettings(profileGioSettings(id), profileSchema)
}

const work = addProfile("work")
work.setName("Work")
```

### Cleaning up an instance

GSettings has no operation for deleting a settings object. To remove an
instance, reset every key at its path, which removes the stored values from the
backend, then drop it from the manager list.

```ts
function removeProfile(id: string) {
  const gioSettings = profileGioSettings(id)
  for (const key of gioSettings.settingsSchema.list_keys()) {
    gioSettings.reset(key)
  }

  manager.setProfiles((prev) => prev.filter((profile) => profile !== id))
}
```
