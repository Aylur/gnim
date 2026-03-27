# Assets

## Icons

Following packaging conventions, the dev server will append `$PWD/data/icons` to
Gtk's icon theme search paths.

Bundling has no additional support, since these icons are expected to be
installed to `<prefix>/<datadir/icons` (usually `/usr/share/icons`) following
Gtk conventions.

## CSS

Gnim supports importing `.css` and `.scss` files. CSS is transpiled using
[lightningcss](https://lightningcss.dev/) and SCSS is transpiled using
[grass](https://github.com/connorskees/grass).

```tsx
import "./style.css"
import "./style.scss"

function MyApp() {
  return <></>
}
```

Importing CSS requires knowing the Gtk version ahead of time, which is inferred
from the codebase so make sure to have at least one versioned import anywhere in
the codebase.

```ts
import "gi://Gtk?version=4.0"
```

## Files

Gnim supports importing files with `?file` suffix which gives you a `Gio.File`
pointing to the file.

```tsx
import image from "./image.png?file"

function Image() {
  return <Gtk.Picture file={image} />
}
```

At development time using `gnim dev` the file will point to the file on the
filesystem and its URI will have a `file://` prefix.

After bundling with `gnim bundle` the fill will point to the resource location
and its URI will have a `resource://` prefix.

```tsx
import image from "./image.png?file"

function Image() {
  function init(self: Gtk.Image) {
    const uri = file.get_uri()
    if (uri.startsWith("file://")) {
      self.set_from_file(uri.replace("file://", ""))
    }
    if (uri.startsWith("resource://")) {
      self.set_from_resource(uri.replace("resource://", ""))
    }
  }

  return <Gtk.Image ref={init} />
}
```
