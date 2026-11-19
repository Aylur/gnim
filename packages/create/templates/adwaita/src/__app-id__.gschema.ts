import {
  defineSchemaList,
  Schema,
  variant as v,
  gettext as t,
} from "gnim/schema"

const APP_ID = "__app-id__"

export const appSchema = new Schema(APP_ID)
  .key("string-key", "s", {
    default: "Hello World!",
    summary: t("String to display"),
  })
  .key("complex-key", "a{sv}", {
    default: {
      key1: v("a{ss}", { nested: "value" }),
      key2: v("s", "value"),
    },
    summary: t("An example complex settings key"),
  })

export default defineSchemaList({
  gettextDomain: APP_ID,
  schemas: [appSchema],
})
