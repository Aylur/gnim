import GLib from "gi://GLib"
import { defineSchemaList, Schema } from "gnim/schema"
import { uuid, "settings-schema" as id } from "../metadata.json"

const v = GLib.Variant.new

export const schema = new Schema(id)
  .key("simple-key", "s", {
    default: "hello",
    summary: (t) => t("An example simple setting"),
  })
  .key("complex-key", "a{sv}", {
    default: {
      key1: v("a{ss}", { nested: "value" }),
      key2: v("s", "value"),
    },
    summary: (t) => t("An example complex setting"),
  })

const schemaList = /* @__PURE__ */ defineSchemaList({
  gettextDomain: uuid,
  schemas: [schema],
})

export default schemaList
