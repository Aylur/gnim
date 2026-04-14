import { useExtension } from "extension"
import Clutter from "gi://Clutter"
import St from "gi://St"
import { effect, onCleanup } from "gnim"
import { register } from "gnim/gobject"
import * as Main from "resource:///org/gnome/shell/ui/main.js"
import * as PanelMenu from "resource:///org/gnome/shell/ui/panelMenu.js"

@register
class PanelMenuButton extends PanelMenu.Button {
  constructor(props: {
    menuAlignment?: number
    nameText: string
    dontCreateMenu?: boolean
    role: string
    position?: number
    box?: "left" | "center" | "right"
  }) {
    super(props.menuAlignment ?? 0.5, props.nameText, props.dontCreateMenu)

    effect(() => {
      Main.panel.addToStatusArea(props.role, this, props.position, props.box)
    })

    onCleanup(() => {
      this.destroy()
    })
  }
}

export default function PanelButton() {
  const { gettext: t, settings, extension } = useExtension()

  function onButtonPressEvent() {
    extension.openPreferences()
    return false
  }

  return (
    <PanelMenuButton
      nameText={t("Example Button")}
      role={extension.uuid}
      onButtonPressEvent={onButtonPressEvent}
    >
      <St.Label
        styleClass="my-label"
        yAlign={Clutter.ActorAlign.CENTER}
        text={settings.simpleKey}
      />
    </PanelMenuButton>
  )
}
