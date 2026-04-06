import Adw from "gi://Adw?version=1"
import Gtk from "gi://Gtk?version=4.0"
import { createState } from "gnim"
import { App } from "./main"

export default function AppContent(props: {
  onEntryActivated: (e: Adw.EntryRow) => void
}) {
  const { gettext: t } = App.gettext
  const { stringKey, setStringKey } = App.settings
  const [number, setNumber] = createState(1)

  return (
    <Gtk.Box
      marginTop={8}
      marginBottom={8}
      marginEnd={8}
      marginStart={8}
      spacing={8}
      orientation={Gtk.Orientation.VERTICAL}
      valign={Gtk.Align.CENTER}
    >
      <Gtk.ListBox class="boxed-list" selectionMode={Gtk.SelectionMode.NONE}>
        <Adw.EntryRow
          title={t("String Key")}
          text={stringKey}
          onNotifyText={({ text }) => setStringKey(text)}
          onEntryActivated={props.onEntryActivated}
        />
      </Gtk.ListBox>

      <Gtk.Box spacing={8} marginTop={12} halign={Gtk.Align.CENTER}>
        <Gtk.Button class="increment" onClicked={() => setNumber((n) => n + 1)}>
          {t("Increment")}
        </Gtk.Button>
        <Gtk.Label widthRequest={18} label={number.as(String)} />
        <Gtk.Button class="decrement" onClicked={() => setNumber((n) => n - 1)}>
          {t("Decrement")}
        </Gtk.Button>
      </Gtk.Box>
    </Gtk.Box>
  )
}
