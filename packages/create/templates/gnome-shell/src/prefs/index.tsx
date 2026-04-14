import { render } from "@gnim-js/gtk4"
import type { Console } from "console"
import Adw from "gi://Adw"
import { createContext } from "gnim"
import { createDomain, type GettextDomain } from "gnim/i18n"
import { createSettings, type CreateSettings } from "gnim/schema"
import { schema } from "org.gnome.shell.extensions.__extension-id__.gschema"
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js"
import PreferencesPage from "./PreferencesPage"

interface PrefsContext {
  logger: Console
  gettext: GettextDomain
  settings: CreateSettings<typeof schema>
  window: Adw.PreferencesWindow
}

const PrefsContext = createContext<PrefsContext | null>(null)

export function usePrefs() {
  const ctx = PrefsContext.use()
  if (!ctx) throw Error("missing ExtensionContext context")
  return ctx
}

export default class extends ExtensionPreferences {
  async fillPreferencesWindow(window: Adw.PreferencesWindow) {
    const settings = createSettings(this.getSettings(), schema)
    const logger = this.getLogger()
    const gettext = createDomain(this)

    const dispose = render(() => {
      return (
        <PrefsContext value={{ settings, logger, gettext, window }}>
          <Adw.PreferencesWindow construct={window}>
            <PreferencesPage />
          </Adw.PreferencesWindow>
        </PrefsContext>
      )
    })

    window.connect("close-request", () => (dispose(), false))
  }
}
