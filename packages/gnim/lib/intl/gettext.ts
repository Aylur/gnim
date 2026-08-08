import Gettext from "gettext"
import type { GetArgs, GetTags } from "./icu"

export declare const args: unique symbol
export declare const tags: unique symbol

export type Text<T> = T & {
    [args]: GetArgs<T>
    [tags]: GetTags<T>
}

export interface GettextDomain {
    /**
     * @param msgid A string to translate.
     * @returns A translated message.
     */
    <const S extends string>(msgid: S): Text<S>
    /**
     * @param msgid A string to translate.
     * @returns A translated message.
     */
    gettext<const S extends string>(msgid: S): Text<S>
    /**
     * @param msgid1 The singular form of the string to be translated.
     * @param msgid2 The plural form of the string to be translated.
     * @param n The number determining the translation form to use.
     * @returns A translated message.
     */
    ngettext<const S1 extends string, const S2 extends string>(
        msgid1: S1,
        msgid2: S2,
        n: number,
    ): Text<S1 | S2>
    /**
     * @param msgctxt A context to disambiguate `msgid`.
     * @param msgid A string to translate.
     * @returns A translated message.
     */
    pgettext<const S extends string>(msgctxt: string, msgid: S): Text<S>
}

/**
 * Create an object with bindings for {@link Gettext.gettext}, {@link Gettext.ngettext},
 * and {@link Gettext.pgettext}, bound to a `domainName`.
 *
 * @param domain A domain name.
 * @returns An object with common gettext methods.
 */
export function createDomain(domain: string | Gettext.GettextDomain): GettextDomain {
    if (typeof domain === "string") {
        domain = Gettext.domain(domain)
    }

    const gettext = domain.gettext.bind(domain)
    const pgettext = domain.pgettext.bind(domain)
    const ngettext = domain.ngettext.bind(domain)

    function t(msgid: string) {
        return gettext(msgid)
    }

    return Object.assign(t, { gettext, pgettext, ngettext }) as GettextDomain
}
