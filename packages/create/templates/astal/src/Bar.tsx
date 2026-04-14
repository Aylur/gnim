import Astal from "gi://Astal?version=4.0"
import Gdk from "gi://Gdk?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import { createPoll } from "@astal/io/timer"
import { createState, For, Portal } from "gnim"
import GLib from "gi://GLib?version=2.0"
import { App } from "./main"
import { fmt } from "gnim/i18n"
import { execAsync } from "@astal/io/process"

export default function Bar(props: { monitor: Gdk.Monitor }) {
  const { gettext: t } = App.gettext
  const [open, setOpen] = createState(false)
  const monitors = Gdk.Display.get_default()!.get_monitors()

  const clock = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local()?.format("%H:%M") ?? ""
  })

  function onClicked() {
    execAsync("echo hello").then(print)
  }

  return (
    <Astal.Window
      application={App.instance}
      visible
      class="Bar"
      gdkmonitor={props.monitor}
      defaultHeight={1}
      defaultWidth={1}
      exclusivity={Astal.Exclusivity.EXCLUSIVE}
      anchor={
        Astal.WindowAnchor.TOP |
        Astal.WindowAnchor.LEFT |
        Astal.WindowAnchor.RIGHT
      }
    >
      <Gtk.CenterBox>
        <Gtk.Box slot="start">
          <Gtk.Button onClicked={onClicked}>{t("Click Me")}</Gtk.Button>
        </Gtk.Box>
        <Gtk.Label
          slot="center"
          class="clock"
          label={clock.as((time) => fmt(t("Time is: {{time}}"), { time }))}
        />
        <Gtk.Button slot="end" onClicked={() => setOpen((o) => !o)}>
          <Gtk.Label label={t("Toggle Popup")} />
          <Portal mount={App.instance}>
            <Astal.Window
              application={app}
              visible={open}
              gdkmonitor={props.monitor}
              anchor={Astal.WindowAnchor.TOP | Astal.WindowAnchor.RIGHT}
            >
              <Gtk.Calendar />
            </Astal.Window>
          </Portal>
        </Gtk.Button>
      </Gtk.CenterBox>
    </Astal.Window>
  )
}
