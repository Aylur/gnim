# Assets

## Icons

There are two kinds of icons:

- Full color icons, that will be displayed as-is
- Symbolic icons, that will be recolored to the text color, allowing them to
  adapt to any style

It's almost always recommended to use symbolic icons. GTK knows that an icon is
symbolic if its name is suffixed with `-symbolic`.

The preferred format is [SVG](https://developer.mozilla.org/en-US/docs/Web/SVG),
so they can be scaled to any size.

Icons must be stored in a specific hierarchy, respecting the
[Icon Theme specification](https://specifications.freedesktop.org/icon-theme/latest/):
`$ICON_THEME/$SIZE/$CONTEXT/`. The default icon theme is `hicolor`, for scalable
SVG the size is `scalable`, and the context is one of the contexts defined in
the
[Icon Naming specification](https://specifications.freedesktop.org/icon-naming/latest/).

During development the dev server will append `$PWD/data/icons` to Gtk's icon
theme search paths. For example, you'd put icons you use on buttons at
`data/icons/hicolor/scalable/actions/my-icon-symbolic.svg`.

```tsx
<Gtk.Image iconName="my-icon-symbolic" />
```

You can then bundle them for production using the `--include` (`-i`) flag. You
should also use a `--prefix` (`-p`) matching
[Application.resourceBasePath](https://docs.gtk.org/gio/property.Application.resource-base-path.html)
so that Gtk registers them on startup.

```sh
gnim bundle -i data/icons -p /com/example/MyApp/ src/main.tsx out.gresource
```

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

::: details Inferring GTK version for imported CSS modules

Importing CSS requires knowing the GTK version ahead of time, which is inferred
from the codebase. Make sure to have at least one versioned import anywhere in
the codebase.

```ts
import "gi://Gtk?version=4.0"
import { render } from "ags/gtk4" // this also counts
```

:::

## Files

Gnim supports importing files with a `?file` suffix, which gives you a
`Gio.File` pointing to the file.

```tsx
import image from "./image.png?file"

function Image() {
  return <Gtk.Picture file={image} />
}
```

During development using `gnim dev` the file will point to the file on the
filesystem and its URI will have a `file://` prefix.

After bundling with `gnim bundle` the file will point to the resource location
and its URI will have a `resource://` prefix.

```tsx
import image from "./image.png?file"

function Image() {
  function init(self: Gtk.Image) {
    const uri = image.get_uri()
    if (uri.startsWith("file://")) {
      self.set_from_file(uri.replace("file://", ""))
    }
    if (uri.startsWith("resource://")) {
      self.set_from_resource(uri.replace("resource://", ""))
    }
  }

  return <Gtk.Image ref={init} />

  // alternatively use Gio.FileIcon
  return <Gtk.Image gicon={Gio.FileIcon.new(image)} />
}
```
