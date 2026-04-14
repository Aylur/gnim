import { defineSchemaList, Schema } from "gnim/schema"

const id = "__app-id__"
const path = `/${id.replaceAll(".", "/")}/`

export const appSchema = new Schema({ id, path })
  //
  .key("string-key", "s", {
    default: "Hello World!",
    summary: "String to display",
  })

export default defineSchemaList([appSchema])
