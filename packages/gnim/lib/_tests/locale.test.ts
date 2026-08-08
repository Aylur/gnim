import { describe, it, expect, beforeEach, vi } from "vitest"

const LOCALE_VARS = ["LANGUAGE", "LC_ALL", "LC_MESSAGES", "LC_TIME", "LANG"]

/** Import a fresh copy, the module caches resolved locales. */
async function importLocale(env: Record<string, string>) {
    for (const name of LOCALE_VARS) vi.stubEnv(name, undefined)
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)

    vi.resetModules()
    return import("../intl/locale")
}

beforeEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe("getLocale", () => {
    it("normalizes a POSIX locale name into a BCP 47 tag", async () => {
        const { getLocale } = await importLocale({ LANG: "en_US.UTF-8" })

        expect(getLocale().toString()).toBe("en-US")
    })

    it("reads the requested category", async () => {
        const { getLocale } = await importLocale({
            LANG: "en_US.UTF-8",
            LC_TIME: "hu_HU.UTF-8",
        })

        expect(getLocale("LC_TIME").toString()).toBe("hu-HU")
    })

    it("strips the modifier", async () => {
        const { getLocale } = await importLocale({ LANG: "de_DE.UTF-8@euro" })

        expect(getLocale().toString()).toBe("de-DE")
    })

    it.each(["C", "POSIX", "not a locale"])("falls back to en-US on %s", async (lang) => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const { getLocale } = await importLocale({ LANG: lang })

        expect(getLocale().toString()).toBe("en-US")
    })

    it("falls back to en-US when the variable is unset", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const { getLocale } = await importLocale({})

        expect(getLocale().toString()).toBe("en-US")
    })
})

describe("getPreferredLocale", () => {
    it("normalizes every entry of LANGUAGE", async () => {
        const { getPreferredLocale } = await importLocale({ LANGUAGE: "hu_HU:en_US.UTF-8:de" })

        expect(getPreferredLocale()).toEqual(["hu-HU", "en-US", "de"])
    })

    it("drops entries that do not name a locale", async () => {
        const { getPreferredLocale } = await importLocale({ LANGUAGE: "hu_HU::C:en" })

        expect(getPreferredLocale()).toEqual(["hu-HU", "en"])
    })

    it("falls through to the next variable when LANGUAGE has no usable entry", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {})
        const { getPreferredLocale } = await importLocale({
            LANGUAGE: "C",
            LC_MESSAGES: "hu_HU.UTF-8",
        })

        expect(getPreferredLocale()).toBe("hu-HU")
    })

    it("prefers LANGUAGE over the LC_* variables", async () => {
        const { getPreferredLocale } = await importLocale({
            LANGUAGE: "de",
            LC_ALL: "hu_HU.UTF-8",
            LANG: "en_US.UTF-8",
        })

        expect(getPreferredLocale()).toEqual(["de"])
    })

    it("resolves in the order gettext does", async () => {
        const { getPreferredLocale } = await importLocale({
            LC_ALL: "hu_HU.UTF-8",
            LC_MESSAGES: "de_DE.UTF-8",
            LANG: "en_US.UTF-8",
        })

        expect(getPreferredLocale()).toBe("hu-HU")
    })
})
