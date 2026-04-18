import { render } from "@gnim-js/gtk4"
import Gdk from "gi://Gdk?version=4.0"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import { For } from "gnim"
import { register } from "gnim/gobject"
import { createDomain } from "gnim/i18n"
import { programArgs, programInvocationName } from "system"
import Bar from "./Bar"
import "./style.css"

@register
export class App extends Gtk.Application {
  static instance: App
  static gettext = createDomain("__app-id__")

  constructor() {
    super({
      applicationId: "__app-id__",
      flags: Gio.ApplicationFlags.HANDLES_COMMAND_LINE,
    })
  }

  override vfunc_command_line(
    this: App,
    cmd: Gio.ApplicationCommandLine,
  ): number {
    const [, ...args] = cmd.get_arguments()
    if (cmd.isRemote) {
      cmd.print_literal("Hello!\n")
    } else {
      this.main(args)
    }
    cmd.done()
    return 0
  }

  protected main(this: App, args: string[]) {
    const dispose = render(
      () => (
        <For each={Gdk.Display.get_default()!.get_monitors()}>
          {(monitor: Gdk.Monitor) => <Bar monitor={monitor} />}
        </For>
      ),
      this,
    )

    this.connect("shutdown", dispose)

    if (args.includes("--hello")) {
      print("Hello!")
    }
  }
}

/* main */ {
  const { gettext: t } = App.gettext
  GLib.set_prgname("__app-name__")
  GLib.set_application_name(t("Gnim Demo Layer Shell App"))

  // avoid leaking it into subprocesses
  GLib.setenv("LD_PRELOAD", "", true)

  App.instance = new App()
  App.instance
    .runAsync([programInvocationName, ...programArgs])
    .catch(console.error)
}
