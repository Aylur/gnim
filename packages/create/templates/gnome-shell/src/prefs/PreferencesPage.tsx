import Gtk from "gi://Gtk"
import Adw from "gi://Adw"
import { usePrefs } from "prefs"
import { style } from "@gnim-js/gtk4"

export default function PreferencesPage() {
  const { settings, gettext } = usePrefs()
  const { simpleKey, setSimpleKey, complexKey } = settings
  const { gettext: t } = gettext

  return (
    <Adw.PreferencesPage>
      <Adw.PreferencesGroup title={t("Simple Group")}>
        <Adw.EntryRow
          text={simpleKey}
          onNotifyText={({ text }) => setSimpleKey(text)}
          title={t("String Key")}
        />
      </Adw.PreferencesGroup>
      <Adw.PreferencesGroup title={t("Complex Group")}>
        <Gtk.Frame>
          <Gtk.TextView class={style({ padding: "8px" })} editable={false}>
            <Gtk.TextBuffer
              text={complexKey.as((v) => JSON.stringify(v, null, 2))}
            />
          </Gtk.TextView>
        </Gtk.Frame>
      </Adw.PreferencesGroup>
    </Adw.PreferencesPage>
  )
}
