import GLib from "gi://GLib?version=2.0"

type LocaleEnvVar =
    | "LANG"
    | "LC_ALL"
    | "LC_CTYPE"
    | "LC_COLLATE"
    | "LC_MESSAGES"
    | "LC_ADDRESS"
    | "LC_IDENTIFICATION"
    | "LC_MEASUREMENT"
    | "LC_MONETARY"
    | "LC_NAME"
    | "LC_NUMERIC"
    | "LC_PAPER"
    | "LC_TELEPHONE"
    | "LC_TIME"
    | (string & {})

const cache = new Map<LocaleEnvVar, Intl.Locale>()

/** Strips the codeset and modifier, e.g. `de_DE.UTF-8@euro` -> `de_DE`. */
function baseName(locale: string) {
    return locale.replace(/\..*$/, "").replace(/@.*$/, "")
}

function isDefaultLocale(locale: string | null) {
    const base = locale && baseName(locale)
    return !base || base === "C" || base === "POSIX"
}

function parseLocale(locale: string | null): Intl.Locale | null {
    if (!locale || isDefaultLocale(locale)) return null

    try {
        return new Intl.Locale(baseName(locale).replace(/_/g, "-"))
    } catch {
        return null
    }
}

/**
 * Get the locale in `Intl.Locale` format from a POSIX locale environment variable.
 *
 * @example LANG="en_US.UTF-8" -> "en-US"
 */
export function getLocale(env: LocaleEnvVar = "LANG") {
    if (cache.has(env)) return cache.get(env)!

    const value = GLib.getenv(env)
    const locale = parseLocale(value)

    if (!locale && !isDefaultLocale(value)) {
        const msg = `Variable ${env} does not specify a valid locale: "${value}", using en-US`
        logError(new Error(msg))
    }

    const resolved = locale ?? new Intl.Locale("en-US")
    cache.set(env, resolved)
    return resolved
}

/**
 * Get the BCP 47 formatted locale in the order that `gettext` resolves them.
 */
export function getPreferredLocale(): string | string[] {
    const messages = GLib.getenv("LC_ALL") || GLib.getenv("LC_MESSAGES") || GLib.getenv("LANG")
    const language = GLib.getenv("LANGUAGE")

    // gettext ignores LANGUAGE when the messages locale is C
    if (language && !isDefaultLocale(messages)) {
        const locales = language
            .split(":")
            .flatMap((name) => parseLocale(name) ?? [])
            .map((locale) => locale.toString())

        if (locales.length > 0) return locales

        if (!language.split(":").every(isDefaultLocale)) {
            logError(new Error(`Variable LANGUAGE does not specify any valid locale: ${language}`))
        }
    }

    const locale = parseLocale(messages)

    if (!locale && !isDefaultLocale(messages)) {
        logError(new Error(`Locale "${messages}" is not valid, using en-US`))
    }

    return (locale ?? new Intl.Locale("en-US")).toString()
}
