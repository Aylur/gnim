# Buildable

The buildable interface allows you to implement custom object relations.

```ts
const setChildren: unique symbol
const appendChild: unique symbol
const removeChild: unique symbol

interface Buildable {
  [setChildren]?(children: GObject.Object[], prev: GObject.Object[]): boolean
  [appendChild]?(child: GObject.Object): boolean
  [removeChild]?(child: GObject.Object): boolean
}
```

## Grid layouts

The `Gtk.Buildable` interface uses custom tags in its UI definitions to define
the layout of `Gtk.Grid`. These tags don't exist at runtime and so cannot be
used within JSX. To fix this, its possible to implement a replacement auxiliary
object (similar to `Gtk.StackChild`). You can implement `Gtk.Buildable` or
Gnim's `Buildable` interface which requires less noise.

```ts
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import { appendChild, removeChild, type Buildable } from "gnim"
import { register } from "gnim/gobject"

interface GridChildProps {
  col: number
  row: number
  colSpan?: number
  rowSpan?: number
}

@register
export class GridChild extends GObject.Object implements Buildable {
  child: Gtk.Widget | null = null

  readonly col: number
  readonly row: number
  readonly colSpan: number
  readonly rowSpan: number

  constructor(props: GridChildProps) {
    super()
    this.col = props.col
    this.row = props.row
    this.colSpan = props.colSpan ?? 1
    this.rowSpan = props.rowSpan ?? 1
  }

  [appendChild](child: GObject.Object) {
    if (child instanceof Gtk.Widget) {
      this.child = child
      return true
    }
    return false
  }

  [removeChild](child: GObject.Object) {
    if (child === this.child) {
      this.child = null
      return true
    }
    return false
  }
}

@register
export class Grid extends Gtk.Grid implements Buildable {
  [appendChild](child: GObject.Object) {
    if (child instanceof GridChild && child.child) {
      this.attach(
        child.child,
        child.col,
        child.row,
        child.colSpan,
        child.rowSpan,
      )
      return true
    }
    return false
  }

  [removeChild](child: GObject.Object) {
    if (child instanceof GridChild && child.child) {
      this.remove(child.child)
      return true
    }
    return false
  }
}
```

> [!NOTE]
>
> This implementation does not handle every usecase since its possible that
> `appendChild` is called with a new widget after its already a child of a Grid.
> It would also require a widget recreation to move the widget around. To
> support reactive position and child properties you can implement
> setters/getters for each `GridChild` property such that they move the child in
> the parent or implement signal handlers in `Grid` so that when a property
> changes it will move the widget accordingly.

### Example Grid and GridChild usage

```tsx
function Comp() {
  return (
    <Grid rowHomogeneous columnHomogeneous>
      <GridChild col={0} row={0}>
        <Gtk.Button>0 0</Gtk.Button>
      </GridChild>
      <GridChild col={1} row={0} colSpan={2}>
        <Gtk.Button>1 0</Gtk.Button>
      </GridChild>
      <GridChild col={0} row={1} colSpan={2}>
        <Gtk.Button>0 1</Gtk.Button>
      </GridChild>
      <GridChild col={2} row={1}>
        <Gtk.Button>2 1</Gtk.Button>
      </GridChild>
    </Grid>
  )
}
```
