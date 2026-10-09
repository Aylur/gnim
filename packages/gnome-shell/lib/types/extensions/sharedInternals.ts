/** @version 49 */
declare module "resource:///org/gnome/shell/extensions/sharedInternals.js" {
    import type { Extension } from "resource:///org/gnome/shell/extensions/extension.js"
    import { Console } from "console"
    import Gio from "gi://Gio?version=2.0"

    interface ExtensionMetadata {
        "uuid": string
        "dir": Gio.File
        "path": string
        "name": string
        "description": string
        "version"?: string
        "url"?: string
        "shell-version": string[]
        "settings-schema"?: string
        "gettext-domain"?: string
        "original-author"?: string[]
        "extension-id"?: string
        "version-name"?: string
    }

    class ExtensionBase {
        readonly metadata: ExtensionMetadata

        /**
         * Look up an extension by URL (usually 'import.meta.url')
         *
         * @param url - a file:// URL
         */
        static lookupByURL(url: string): Extension | null

        /**
         * Look up an extension by UUID
         *
         * @param {string} _uuid
         */
        static lookupByUUID(_uuid: string): Extension | null

        /**
         * @param metadata - metadata passed in when loading the extension
         */
        constructor(metadata: object)

        readonly uuid: string

        readonly dir: Gio.File

        readonly path: string

        /**
         * Get a GSettings object for schema, using schema files in
         * extensionsdir/schemas. If schema is omitted, it is taken
         * from metadata['settings-schema'].
         *
         * @param schema - the GSettings schema id
         */
        getSettings(schema?: string): Gio.Settings

        getLogger(): Console

        /**
         * Initialize Gettext to load translations from extensionsdir/locale. If
         * domain is not provided, it will be taken from metadata['gettext-domain']
         * if provided, or use the UUID
         *
         * @param domain - the gettext domain to use
         */
        initTranslations(domain?: string): void

        /**
         * Translate `str` using the extension's gettext domain
         *
         * @param str - the string to translate
         *
         * @returns the translated string
         */
        gettext(str: string): string

        /**
         * Translate `str` and choose plural form using the extension's gettext domain
         *
         * @param str - the string to translate
         * @param strPlural - the plural form of the string
         * @param n - the quantity for which translation is needed
         *
         * @returns the translated string
         */
        ngettext(str: string, strPlural: string, n: number): string

        /**
         * Translate `str` in the context of `context` using the extension's gettext domain
         *
         * @param context - context to disambiguate `str`
         * @param str - the string to translate
         *
         * @returns the translated string
         */
        pgettext(context: string, str: string): string
    }
}
