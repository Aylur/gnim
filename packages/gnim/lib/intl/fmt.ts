import { IntlMessageFormat, type PrimitiveType } from "intl-messageformat"
import type { GnimNode, JSX } from "../jsx/element"
import type { Text, args, tags } from "./gettext"
import { getPreferredLocale } from "./locale"

type Prettify<T> = { [K in keyof T]: T[K] }

type FmtArgs<T, Fn> = T extends {
    [args]: infer Args
    [tags]: infer Tags
}
    ? Prettify<Args & Record<Extract<Tags, string>, Fn>>
    : never

const preferredLocale = getPreferredLocale()

/**
 * Replace placeholders and format XML tags as strings.
 */
export function fmt<T extends Text<any>>(
    text: T,
    fmtArgs: FmtArgs<T, (content: NoInfer<string>) => string>,
): string

/**
 * Replace placeholders and format XML tags as JSX.
 */
export function fmt<T extends Text<any>>(
    text: T,
    fmtArgs: FmtArgs<T, (content: NoInfer<JSX.Element>) => JSX.Element>,
): JSX.Element

export function fmt(text: string, fmtArgs: Record<string, any>): GnimNode {
    return new IntlMessageFormat(text, preferredLocale).format(fmtArgs)
}

type StringFmtArgs<T> = T extends {
    [args]: infer Args
}
    ? Prettify<Args>
    : never

/**
 * Replace placeholders. Leaves XML tags in place as-is.
 */
export function sfmt<T extends Text<any>>(text: T, fmtArgs: StringFmtArgs<T>): string

export function sfmt(text: string, fmtArgs: Record<string, PrimitiveType>): string {
    const message = new IntlMessageFormat(text, preferredLocale, undefined, { ignoreTag: true })

    const result = message.format(fmtArgs)
    if (Array.isArray(result)) {
        return result.map(String).join("")
    }

    return String(result)
}
