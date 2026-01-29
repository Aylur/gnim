/// <reference path="./GLib-2.0.d.ts" />

declare module "gettext" {
    import type GLib from "gi://GLib?version=2.0"

    /**
     * This module provides a convenience layer for the "gettext" family
     * of functions, relying on GLib for the actual implementation.
     *
     * Example usage:
     * ```js
     * import Gettext from "gettext"
     *
     * Gettext.textdomain('myapp');
     * Gettext.bindtextdomain('myapp', '/usr/share/locale');
     *
     * let translated = Gettext.gettext('Hello world!');
     * ```
     */
    namespace Gettext {
        /** An enumeration of locale categories supported by GJS. */
        enum LocaleCategory {
            /** Character classification */
            CTYPE = 0,
            /** Formatting of nonmonetary numeric values */
            NUMERIC = 1,
            /** Formatting of date and time values */
            TIME = 2,
            /** String collation */
            COLLATE = 3,
            /** Formatting of monetary values */
            MONETARY = 4,
            /** Localizable natural-language messages */
            MESSAGES = 5,
            /** All of the locale */
            ALL = 6,
        }

        /**
         * Set or query the program's current locale.
         *
         * Note: It is rarely, if ever, necessary to call this function in GJS.
         *
         * @param category A locale category.
         * @param locale A locale string, or `null` to query the locale.
         * @returns A locale string, or `null` if `locale` is not `null`.
         */
        function setlocale(
            category: LocaleCategory,
            locale: string | null,
        ): string | null

        /**
         * Set the default domain to `domainName`, which is used in all future gettext calls.
         *
         * Note that this does not affect functions that take an explicit `domainName`
         * argument, such as {@link Gettext.dgettext}.
         *
         * @param domainName A translation domain.
         */
        function textdomain(domainName: string): string

        /**
         * Specify `dirName` as the directory that contains translations for `domainName`.
         *
         * @param domainName A translation domain.
         * @param dirName A directory path.
         */
        function bindtextdomain(domainName: string, dirName: string): string

        /**
         * A wrapper of {@link Gettext.dgettext} which does not translate the message if the
         * default domain as set with {@link Gettext.textdomain} has no translations for the
         * current locale.
         *
         * Note: This is equivalent to calling `Gettext.dgettext(null, msgid)`.
         *
         * @param msgid A string to translate.
         * @returns A translated message.
         */
        function gettext(msgid: string): string

        /**
         * Note: This is an alias for {@link GLib.dgettext}.
         *
         * @param domainName A translation domain.
         * @param msgid A string to translate.
         * @returns A translated message.
         */
        function dgettext(domainName: string | null, msgid: string): string

        /**
         * This is a variant of {@link Gettext.dgettext} that allows specifying a locale category.
         *
         * Note: This is an alias for {@link GLib.dcgettext}.
         *
         * @param domainName A translation domain.
         * @param msgid A string to translate.
         * @param category A locale category.
         * @returns A translated message.
         */
        function dcgettext(
            domainName: string | null,
            msgid: string,
            category: LocaleCategory,
        ): string

        /**
         * Translate a string that may or may not be plural, like "I have 1 apple" and
         * "I have 2 apples".
         *
         * Note: This is equivalent to calling `Gettext.dngettext(null, msgid1, msgid2, n)`.
         *
         * @param msgid1 The singular form of the string to be translated.
         * @param msgid2 The plural form of the string to be translated.
         * @param n The number determining the translation form to use.
         * @returns A translated message.
         */
        function ngettext(msgid1: string, msgid2: string, n: number): string

        /**
         * Note: This is an alias for {@link GLib.dngettext}.
         *
         * @param domainName A translation domain.
         * @param msgid1 A string to translate.
         * @param msgid2 A pluralized string to translate.
         * @param n The number determining the translation form to use.
         * @returns A translated message.
         */
        function dngettext(
            domainName: string | null,
            msgid1: string,
            msgid2: string,
            n: number,
        ): string

        /**
         * This is a variant of {@link Gettext.dgettext} which supports a disambiguating
         * message context.
         *
         * Note: This is equivalent to calling `Gettext.dpgettext(null, context, msgid)`.
         *
         * @param context A context to disambiguate `msgid`.
         * @param msgid A string to translate.
         * @returns A translated message.
         */
        function pgettext(context: string | null, msgid: string): string

        /**
         * This is a variant of {@link Gettext.dgettext} which supports a disambiguating
         * message context.
         *
         * Note: This is an alias for {@link GLib.dpgettext2}.
         *
         * @param domainName A translation domain.
         * @param context A context to disambiguate `msgid`.
         * @param msgid A string to translate.
         * @returns A translated message.
         */
        function dpgettext(
            domainName: string | null,
            context: string | null,
            msgid: string,
        ): string

        interface GettextDomain {
            /** @param msgid A string to translate. @returns A translated message. */
            gettext: (msgid: string) => string
            /**
             * @param msgid1 The singular form of the string to be translated.
             * @param msgid2 The plural form of the string to be translated.
             * @param n The number determining the translation form to use.
             * @returns A translated message.
             */
            ngettext: (msgid1: string, msgid2: string, n: number) => string
            /**
             * @param context A context to disambiguate `msgid`.
             * @param msgid A string to translate.
             * @returns A translated message.
             */
            pgettext: (context: string | null, msgid: string) => string
        }

        /**
         * Create an object with bindings for {@link Gettext.gettext}, {@link Gettext.ngettext},
         * and {@link Gettext.pgettext}, bound to a `domainName`.
         *
         * @param domainName A domain name.
         * @returns An object with common gettext methods.
         */
        function domain(domainName: string): GettextDomain
    }

    export import LocaleCategory = Gettext.LocaleCategory
    export import setlocale = Gettext.setlocale
    export import textdomain = Gettext.textdomain
    export import bindtextdomain = Gettext.bindtextdomain
    export import gettext = Gettext.gettext
    export import dgettext = Gettext.dgettext
    export import dcgettext = Gettext.dcgettext
    export import ngettext = Gettext.ngettext
    export import dngettext = Gettext.dngettext
    export import pgettext = Gettext.pgettext
    export import dpgettext = Gettext.dpgettext
    export import domain = Gettext.domain

    export default Gettext
}
