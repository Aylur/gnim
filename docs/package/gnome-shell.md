# `@gnim-js/gnome-shell`

> [!WARNING]
>
> GNOME Shell support is experimental.

Renderer for GNOME Shell extensions. It renders
[Clutter](https://gnome.pages.gitlab.gnome.org/mutter/clutter/) actors and
[St](https://gnome.pages.gitlab.gnome.org/gnome-shell/st/) widgets.

> [!TIP]
>
> The quickest way to get a working extension setup is the `gnome-shell`
> template:
>
> ```sh
> npm create gnim@beta -- --template gnome-shell
> ```

## `render`

Mounts a JSX tree and returns a dispose function that tears it down.

```ts
function render(element: () => GnimNode, root?: GObject.Object): () => void
```

When a `root` actor is given, top level actors are added to it as children.
Without a `root`, the components are responsible for attaching themselves to the
Shell, for example by adding themselves to the panel.

The returned dispose function can be used directly as the extension's `disable`
method.

Example:

```tsx
import { render } from "@gnim-js/gnome-shell"
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js"
import PanelButton from "./PanelButton"

// [!code focus:5]
export default class extends Extension {
  enable(): void {
    this.disable = render(() => <PanelButton />)
  }
}
```

GNOME shell's classes that do not have a single property bag constructor
parameter have to be wrapped in a function or have to be subclassed that do have
a single property bag constructor parameter in order to use them in JSX
expressions.

```tsx [PanelButton.tsx]
import Clutter from "gi://Clutter"
import St from "gi://St"
import { effect } from "gnim"
import { register } from "gnim/gobject"
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js"

// [!code focus:10]
@register
class PanelMenuButton extends PanelMenu.Button {
  constructor(props: { nameText: string; role: string }) {
    super(0.5, props.nameText)

    onMount(() => {
      Main.panel.addToStatusArea(props.role, this)
    })
  }
}

export default function PanelButton() {
  return (
    // [!code focus:3]
    <PanelMenuButton nameText="Example Button" role="example-button">
      <St.Label text="Hello" yAlign={Clutter.ActorAlign.CENTER} />
    </PanelMenuButton>
  )
}
```

Note that it is not required to explicitly `destroy()` actors. The renderer
manages the lifetime of actors and will destroy them when they are unmounted.

> [!IMPORTANT]
>
> The package does not ship types for `resource:///org/gnome/shell/ui/*`
> modules, such as `main.js` and `panelMenu.js` in the example above. They have
> to be declared manually.

### Children

Children are attached to a `Clutter.Actor` parent based on their type.

| Child                   | Method                       |
| ----------------------- | ---------------------------- |
| text                    | added as an `St.Label` child |
| `Clutter.Actor`         | `add_child`                  |
| `Clutter.Action`        | `add_action`                 |
| `Clutter.Constraint`    | `add_constraint`             |
| `Clutter.LayoutManager` | `set_layout_manager`         |

```tsx
<St.Widget>
  <Clutter.BoxLayout orientation={Clutter.Orientation.VERTICAL} spacing={8} />
  <St.Label text="first" />
  Second
</St.Widget>
```

Actors are destroyed when they are removed from the tree.

### Styling

The renderer does not define any additional JSX attributes. St widgets can be
styled with their own `styleClass` and `style` properties.

```tsx
<St.Label styleClass="my-label" style="color: red;" text="styled" />
```

## Types

The package ships types for three GNOME shell JavaScript module:

- `resource:///org/gnome/shell/extensions/extension.js`
- `resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js`
- `resource:///org/gnome/shell/extensions/sharedInternals.js`

> [!IMPORTANT]
>
> We do not maintain declarations for other modules such as `main.js`. They have
> to be declared from user code.

Types for GNOME Shell libraries (`Clutter`, `Cogl`, `Meta`, `Mtk`, `St`,
`Shell`, `Gvc`) have to be generated. The package ships their `.gir` files under
`gir-1.0/gnome<version>` (`gnome49` and `gnome50`), which can be fed to the
[CLI](/reference/cli#gnim-types):

```sh
gnim types -d node_modules/@gnim-js/gnome-shell/gir-1.0/gnome50 --alias
```
