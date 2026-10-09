/** @version 49 */
declare module "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js" {
    import Gtk from "gi://Gtk?version=4.0"
    import Adw from "gi://Adw?version=1"
    import type { GettextDomain } from "gettext"
    import { ExtensionBase } from "resource:///org/gnome/shell/extensions/sharedInternals.js"

    export class ExtensionPreferences extends ExtensionBase {
        static defineTranslationFunctions(url: string): GettextDomain

        /**
         * Get the single widget that implements
         * the extension's preferences.
         *
         * @returns {Gtk.Widget|Promise<Gtk.Widget>}
         */
        getPreferencesWidget(): Gtk.Widget | Promise<Gtk.Widget>

        /**
         * Fill the preferences window with preferences.
         *
         * The default implementation adds the widget returned by {@link getPreferencesWidget}.
         *
         * @param window - the preferences window
         */
        fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void>
    }
}
