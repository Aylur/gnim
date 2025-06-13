# Polyfills

GJS does not implement some common APIs that you would expect from a JavaScript
runtime. See this [gjs issue](https://gitlab.gnome.org/GNOME/gjs/-/issues/265)
for context.

## fetch

Gnim provides a basic implementation for the `fetch` API.

```ts
import { fetch, URL } from "gnim/fetch"

const url = new URL("https://some-site.com/api")
url.searchParams.set("hello", "world")

const res = await fetch(url, {
  method: "POST",
  body: JSON.stringify({ hello: "world" }),
  headers: {
    "Content-Type": "application/json",
  },
})

const json = await res.json()
```
