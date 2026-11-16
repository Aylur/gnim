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
function baseName(name: string) {
    return name.replace(/\..*$/, "").replace(/@.*$/, "")
}

function isDefaultLocale(name: string) {
    const base = baseName(name)
    return !base || base === "C" || base === "POSIX"
}

function parseLocale(name: string): Intl.Locale | null {
    if (isDefaultLocale(name)) return null

    try {
        return new Intl.Locale(baseName(name).replace(/_/g, "-"))
    } catch {
        return null
    }
}

function getLocaleFromEnv(env: LocaleEnvVar): Intl.Locale {
    const lang = GLib.getenv(env) ?? ""
    const locale = parseLocale(lang)

    if (locale) return locale

    if (!isDefaultLocale(lang)) {
        logError(new Error(`Variable ${env} does not specify a valid locale: ${lang}, using en-US`))
    }

    return new Intl.Locale("en-US")
}

/**
 * Get the locale in `Intl.Locale` format from a POSIX locale environment variable.
 *
 * @example LANG="en_US.UTF-8" -> "en-US"
 */
export function getLocale(env: LocaleEnvVar = "LANG") {
    let locale = cache.get(env)
    if (locale) return locale

    locale = getLocaleFromEnv(env)
    cache.set(env, locale)
    return locale
}

/**
 * Get the BCP 47 formatted locale in the order that `gettext` resolves them.
 */
export function getPreferredLocale(): string | string[] {
    const language = GLib.getenv("LANGUAGE")

    if (language) {
        const locales = language
            .split(":")
            .flatMap((name) => parseLocale(name) ?? [])
            .map((locale) => locale.toString())

        if (locales.length > 0) return locales

        if (!language.split(":").every(isDefaultLocale)) {
            logError(new Error(`Variable LANGUAGE does not specify any valid locale: ${language}`))
        }
    }

    if (GLib.getenv("LC_ALL")) {
        return getLocale("LC_ALL").toString()
    }

    if (GLib.getenv("LC_MESSAGES")) {
        return getLocale("LC_MESSAGES").toString()
    }

    return getLocale("LANG").toString()
}
