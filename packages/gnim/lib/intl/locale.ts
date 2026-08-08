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

function parseLocale(name: string): Intl.Locale | null {
    if (!name || name === "C" || name === "POSIX") return null

    try {
        return new Intl.Locale(name.replace(/\..*$/, "").replace(/@.*$/, "").replace(/_/g, "-"))
    } catch {
        return null
    }
}

function getLocaleFromEnv(env: LocaleEnvVar): Intl.Locale {
    const lang = GLib.getenv(env)
    const locale = lang ? parseLocale(lang) : null

    if (locale) return locale

    console.error("Falling back to en-US", new Error(`Variable ${env} does not specify a locale`))
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

        console.error(
            "Ignoring LANGUAGE",
            new Error(`Variable LANGUAGE does not specify any locale: ${language}`),
        )
    }

    if (GLib.getenv("LC_ALL")) {
        return getLocale("LC_ALL").toString()
    }

    if (GLib.getenv("LC_MESSAGES")) {
        return getLocale("LC_MESSAGES").toString()
    }

    return getLocale("LANG").toString()
}
