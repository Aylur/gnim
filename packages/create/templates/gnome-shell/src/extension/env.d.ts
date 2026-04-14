// gnim/gnome-shell does not yet provide gnome shell types

declare module "resource:///org/gnome/shell/ui/main.js" {
  import St from "gi://St"

  class Panel extends St.Widget {
    addToStatusArea(
      role: string,
      indicator: St.Widget,
      position?: number,
      box?: "left" | "center" | "right",
    ): St.Widget
  }
}

declare module "resource:///org/gnome/shell/ui/main.js" {
  import { Panel } from "resource:///org/gnome/shell/ui/main.js"

  const panel: Panel
}

declare module "resource:///org/gnome/shell/ui/panelMenu.js" {
  import St from "gi://St"

  class Button extends St.Widget {
    constructor(
      menuAlignment: number,
      nameText: string,
      dontCreateMenu?: boolean,
    )
  }
}
