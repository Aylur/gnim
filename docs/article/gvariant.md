# Variant

[`GLib.Variant`](https://docs.gtk.org/glib/struct.Variant.html) is a value
container whose types are determined at construction, often with type strings.
Notably [GSchemas](/reference/schemas) are stored in this format and all
[DBus](/reference/dbus) method, property and signal values are `GLib.Variant`
objects.

In some ways you can think of GVariant like JSON and each `GLib.Variant` object
like a JSON document. It's a format for storing structured data that can be
serialized while preserving type information.

```ts
import GLib from "gi://GLib?version=2.0"

// Serializing JSON to a string
// Output: {"name":"Mario","lives":3,"active":true}
const json = {
  name: "Mario",
  lives: 3,
  active: true,
}

const jsonString = JSON.stringify(json)

// Serializing GVariant to a string
// Output: {'name': <'Mario'>, 'lives': <uint32 3>, 'active': <true>}
const variant = new GLib.Variant("a{sv}", {
  name: GLib.Variant.new_string("Mario"),
  lives: GLib.Variant.new_uint32(3),
  active: GLib.Variant.new_boolean(true),
})

const variantString = variant.print(true)
```

Compared to JSON, GVariant has the benefit of being strongly typed, with the
ability to serialize special values like file handles. GVariant serves as a
reliable and efficient format a number of places in the GNOME Platform including
GDBus, GSettings, GAction, GMenu and others.

## Basic Usage

Standard usage of GVariant is very straight-forward. You can use the constructor
methods like `GLib.Variant.new_string()` to create new `GLib.Variant` objects
and the instance methods like `GLib.Variant.prototype.get_string()` to extract
their values.

Below are some examples of some the standard functions in GLib for working with
`GLib.Variant` objects:

```ts
// Simple types work pretty much like you expect
const variantBool = GLib.Variant.new_boolean(true)

if (variantBool.get_type_string() === "b") {
  console.log("Variant is a boolean!")
}

if (variantBool.get_boolean() === true) {
  console.log("Value is true!")
}

// NOTE: All numeric types are still `Number` values, so some
// 64-bit values may not be fully supported.
const variantInt64 = GLib.Variant.new_int64(-42)

if (variantInt64.get_type_string() === "x") {
  console.log("Variant is an int64!")
}

if (variantInt64.get_int64() === -42) {
  console.log("Value is -42!")
}

// NOTE: GLib.Variant.prototype.get_string() returns the value and the length
const variantString = GLib.Variant.new_string("a string")
const [strValue, strLength] = variantString.get_string()

if (variantString.get_type_string() === "s") {
  console.log("Variant is a string!")
}

if (variantString.get_string()[0] === "a string") {
  console.log("Success!")
}

// List of strings are also straight forward
const stringList = ["one", "two"]
const variantStrv = GLib.Variant.new_strv(stringList)

if (variantStrv.get_type_string() === "as") {
  console.log("Variant is an array of strings!")
}

if (variantStrv.get_strv().every((value) => stringList.includes(value))) {
  console.log("Success!")
}
```

If you ever get stuck trying to figure out how exactly a variant is packed,
there are some helpful functions you can use to debug. Check the documentation
for more.

```ts
const deepDict = new GLib.Variant("a{sv}", {
  key1: GLib.Variant.new_string("string"),
  key2: GLib.Variant.new_boolean(true),
})

// "{'key1': <'string'>, 'key2': <true>}"
console.log(deepDict.print(true))

// "a{sv}"
console.log(deepDict.get_type_string())
```

## Packing Variants

In addition to the constructor methods in GLib, you can construct `GLib.Variant`
objects with the `new` keyword by passing a type string, followed by the values.
The
[GVariant Format Strings](https://docs.gtk.org/glib/gvariant-format-strings.html)
page thoroughly describes the types and their string representations.

```ts
// Both of these function create identical GVariant instances
const stringList = ["one", "two"]
const variantStrv1 = GLib.Variant.new_strv("as", stringList)
const variantStrv2 = new GLib.Variant("as", stringList)

if (variantStrv1.get_type_string() === "as") {
  console.log("Variant is an array of strings!")
}

if (variantStrv1.equal(variantStrv2)) {
  console.log("Success!")
}

if (variantStrv1.get_strv().every((value) => stringList.includes(value))) {
  console.log("Success!")
}
```

This method makes creating complex variants much easier including arrays (`[]`),
dictionaries (`a{sv}`) and tuples (`()`). Note that JavaScript has no tuple
type, so they are packed and unpacked as `Array`.

```ts
const variantTuple = new GLib.Variant("(siaua{sv})", [
  /* s */ "string",
  /* i */ -1,
  /* au */ [1, 2, 3],
  /* a{sv} */ {
    /* sv */ "code-name": new GLib.Variant("s", "007"),
    /* sv */ "licensed-to-kill": new GLib.Variant("b", true),
  },
])

const shallowDict = new GLib.Variant("a{ss}", {
  key1: "value1",
  key2: "value2",
})

const deepDict = new GLib.Variant("a{sv}", {
  key1: new GLib.Variant("s", "string"),
  key2: new GLib.Variant("b", true),
})
```

## Unpacking Variants

GJS also has functions to make it easier to unpack `GLib.Variant` objects into
JS native values. `unpack()`, `deepUnpack()` and `recursiveUnpack()` will
extract the native values from `GLib.Variant` objects at various levels.

#### `unpack()`

`GLib.Variant.prototype.unpack()` is a useful function for unpacking a single
level of a variant.

```ts
const variantBool = GLib.Variant.new_boolean(true)
print(variantBool.unpack()) // true

// NOTE: unpack() is discarding the string length and returns only the value
const variantString = GLib.Variant.new_string("a string")
print(variantString.unpack()) // "a string"

// In this case, unpack() is only unpacking the array, not the strings in it.
const variantStrv = GLib.Variant.new_strv(["one"])
print(variantStrv.unpack()) // [object variant of type "s"]
```

#### `deepUnpack()`

`GLib.Variant.prototype.deepUnpack()` will unpack a variant and its children,
but only up to one level.

```ts
const variantStrv = GLib.Variant.new_strv(["one", "two"])
print(variantStrv.deepUnpack()) // "one","two"

const shallowDict = new GLib.Variant("a{ss}", {
  key1: "value1",
  key2: "value2",
})
print(shallowDict.deepUnpack()) // { "key1": "value1", "key2": "value2" }

const deepDict = new GLib.Variant("a{sv}", {
  key1: GLib.Variant.new_string("string"),
})
print(deepDict.deepUnpack()) // { "key1": [object variant of type "s"] }
```

#### `recursiveUnpack()`

`GLib.Variant.prototype.recursiveUnpack()` will unpack a variant and all its
descendants.

Note that `GLib.Variant.prototype.recursiveUnpack()` will unpack all variants to
JS native values (ie. `Number`) so type information may be lost. You will have
to know the original types to repack those values.

```ts
const deepDict = new GLib.Variant("a{sv}", {
  key1: GLib.Variant.new_string("string"),
  key2: GLib.Variant.new_boolean(true),
})
print(deepDict.recursiveUnpack()) // { "key1": "string", "key2": true }
```
