import { render } from "@gnim-js/gnome-shell"
import type { Console } from "console"
import type { GettextDomain } from "gnim/i18n"
import type { CreateSettings } from "gnim/schema"
import { createContext } from "gnim"
import { createDomain } from "gnim/i18n"
import { createSettings } from "gnim/schema"
import { schema } from "org.gnome.shell.extensions.__extension-id__.gschema"
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js"
import PanelButton from "./PanelButton"

interface ExtensionContext {
  logger: Console
  gettext: GettextDomain
  settings: CreateSettings<typeof schema>
  extension: Extension
}

const ExtensionContext = createContext<ExtensionContext | null>(null)

export function useExtension() {
  const ctx = ExtensionContext.use()
  if (!ctx) throw Error("missing ExtensionContext context")
  return ctx
}

export default class extends Extension {
  enable(): void {
    const ctx: ExtensionContext = {
      gettext: createDomain(this),
      settings: createSettings(this.getSettings(), schema),
      logger: this.getLogger(),
      extension: this,
    }

    this.disable = render(() => (
      <ExtensionContext value={ctx}>
        <PanelButton />
      </ExtensionContext>
    ))
  }
}
