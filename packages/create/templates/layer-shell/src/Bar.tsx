import { execAsync } from "@gnim-js/io/process"
import { createPoll } from "@gnim-js/io/timer"
import Gls from "gi://Gtk4LayerShell?version=1.0"
import Gdk from "gi://Gdk?version=4.0"
import GLib from "gi://GLib?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import { createState, Portal } from "gnim"
import { fmt } from "gnim/i18n"
import { App } from "./main"

export default function Bar(props: { monitor: Gdk.Monitor }) {
  const { gettext: t } = App.gettext
  const [open, setOpen] = createState(false)

  const clock = createPoll("", 1000, () => {
    return GLib.DateTime.new_now_local()?.format("%H:%M") ?? ""
  })

  function onClicked() {
    execAsync("echo hello").then(print)
  }

  function initBarWindow(win: Gtk.Window) {
    Gls.init_for_window(win)
    Gls.set_namespace(win, "my-shell-bar")
    Gls.set_monitor(win, props.monitor)
    Gls.set_anchor(win, Gls.Edge.TOP, true)
    Gls.set_anchor(win, Gls.Edge.LEFT, true)
    Gls.set_anchor(win, Gls.Edge.RIGHT, true)
    Gls.auto_exclusive_zone_enable(win)
  }

  function initPopupWindow(win: Gtk.Window) {
    Gls.init_for_window(win)
    Gls.set_namespace(win, "my-shell-popup")
    Gls.set_monitor(win, props.monitor)
    Gls.set_anchor(win, Gls.Edge.TOP, true)
    Gls.set_anchor(win, Gls.Edge.RIGHT, true)
    Gls.set_keyboard_mode(win, Gls.KeyboardMode.ON_DEMAND)
  }

  return (
    <Gtk.Window
      ref={initBarWindow}
      application={App.instance}
      visible
      class="Bar"
      defaultHeight={1}
      defaultWidth={1}
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
            <Gtk.Window ref={initPopupWindow} visible={open}>
              <Gtk.Calendar />
            </Gtk.Window>
          </Portal>
        </Gtk.Button>
      </Gtk.CenterBox>
    </Gtk.Window>
  )
}
