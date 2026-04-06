import Adw from "gi://Adw?version=1"
import Gtk from "gi://Gtk?version=4.0"
import AppContent from "./AppContent"
import { App } from "./main"

export default function AppWindow() {
  let toasts: Adw.ToastOverlay

  const { gettext: t } = App.gettext
  const { stringKey } = App.settings

  function addToast() {
    toasts.add_toast(
      new Adw.Toast({
        title: stringKey.peek(),
        timeout: 2,
      }),
    )
  }

  function initWindow(win: Gtk.Window) {
    if (App.isDev) {
      win.add_css_class("devel")
      win.present()
    }
  }

  return (
    <Adw.ApplicationWindow ref={initWindow} title={t("My Awesome App")}>
      <Adw.ToastOverlay ref={(self) => (toasts = self)}>
        <Adw.ToolbarView>
          <Adw.HeaderBar slot="top">
            <Adw.WindowTitle
              slot="title"
              title={t("My Awesome App")}
              subtitle={t("Written with Gnim")}
            />
          </Adw.HeaderBar>
          <Gtk.ScrolledWindow>
            <Adw.Clamp maximumSize={400}>
              <AppContent onEntryActivated={addToast} />
            </Adw.Clamp>
          </Gtk.ScrolledWindow>
        </Adw.ToolbarView>
      </Adw.ToastOverlay>
    </Adw.ApplicationWindow>
  )
}
