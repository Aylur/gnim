import GLib from "gi://GLib?version=2.0"
import { defineSchemaList, Schema } from "gnim/schema"

const v = GLib.Variant.new

export const schema = new Schema({
  id: "org.gnome.shell.extensions.__extension-id__",
  path: "/org/gnome/shell/extensions/__extension-id__/",
})
  .key("simple-key", "s", {
    default: "hello",
  })
  .key("complex-key", "a{sv}", {
    default: {
      key1: v("a{ss}", { nested: "value" }),
      key2: v("s", "value"),
    },
  })

export default defineSchemaList([schema])
