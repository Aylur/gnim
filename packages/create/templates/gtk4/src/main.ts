import "./style.css"
import Adw from "gi://Adw?version=1"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { register } from "gnim/gobject"
import { render } from "@gnim-js/gtk4"
import { createDomain } from "gnim/i18n"
import { createSettings } from "gnim/schema"
import { programArgs, programInvocationName } from "system"
import { appSchema } from "./__app-id__.gschema"
import AppWindow from "./AppWindow"

export class App extends Adw.Application {
  static gettext = createDomain("__app-id__")
  static settings = createSettings(appSchema)
  static isDev = !!GLib.getenv("GNIM_DEV")

  constructor() {
    super({
      applicationId: "__app-id__",
      flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
    })

    const { gettext: t } = App.gettext
    GLib.set_prgname("__app-name__")
    GLib.set_application_name(t("Gnim Demo App"))
  }

  vfunc_startup(this: App): void {
    super.vfunc_startup()
    const dispose = render(AppWindow, this)
    this.connect("shutdown", dispose)
  }

  vfunc_activate(): void {
    for (const window of this.get_windows()) {
      window.present()
    }
  }

  static {
    const App = register(this)
    const app = new App()
    app.runAsync([programInvocationName, ...programArgs])
  }
}
