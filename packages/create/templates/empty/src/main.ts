/*% if vala %*/
import __vala_namespace__ from "gi://__vala_namespace__?version=0"
/*% endif %*/
import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { createDomain } from "gnim/intl"
import { programArgs, programInvocationName } from "system"

const { gettext: t } = createDomain("__app-id__")

const app = Gio.Application.new(
  "__app-id__",
  Gio.ApplicationFlags.DEFAULT_FLAGS,
)

app.connect("activate", () => {
  /*% if vala %*/
  app.hold()
  __vala_namespace__.hello((_, res) => {
    print(__vala_namespace__.hello_finish(res))
    app.release()
  })
  /*% else %*/
  print(t("Hello!"))
  /*% endif %*/
})

GLib.set_prgname("__app-name__")
GLib.set_application_name(t("Gnim Demo Program"))
app.runAsync([programInvocationName, ...programArgs])
