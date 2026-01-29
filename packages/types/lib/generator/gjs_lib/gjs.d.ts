/// <reference lib="es2018" />

import type GObject from "gi://GObject?version=2.0"
import type System from "system"
import type Gettext from "gettext"
import type format from "./format"
import type cairo from "./cairo"

declare global {
    interface LegacyGiImports {}

    interface LegacyImports {
        gi: LegacyGiImports
        system: typeof System
        gettext: typeof Gettext
        cairo: typeof cairo
        format: typeof format
        searchPath: string[]

        // TODO:
        // signals: typeof signals
        // package: typeof package

        // TODO: using this is not recommended
        // mainloop: typeof mainloop

        // TODO: these are deprecated
        // lang: typeof lang
        // byteArray: typeof byteArray
    }

    /** @deprecated use ESModules */
    const imports: LegacyImports

    interface ImportMeta {
        /**
         * The absolute file: or resource: URL of the module.
         * @see https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/ESModules.md#importmetaurl
         */
        url: string
    }

    const ARGV: string[]

    interface Error {
        matches(): boolean
    }

    interface BooleanConstructor {
        $gtype: GObject.GType<boolean>
    }

    interface NumberConstructor {
        $gtype: GObject.GType<number>
    }

    interface StringConstructor {
        $gtype: GObject.GType<string>
    }

    interface ObjectConstructor {
        $gtype: GObject.GType<object>
    }
}
