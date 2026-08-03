import { describe, expect, it } from "vitest"
import { createDomain, fmt, sfmt, type Text } from "../i18n/index.js"
import type { GnimNode } from "../jsx/element.js"

const t = createDomain("")

const rawFmt = fmt as (
    input: string,
    values: Record<string, string | number | ((content: GnimNode) => GnimNode)>,
) => GnimNode

describe("sfmt", () => {
    it("substitutes a slot", () => {
        expect(sfmt(t("Hello {{name}}"), { name: "World" })).toBe("Hello World")
    })

    it("substitutes multiple slots including numbers", () => {
        expect(sfmt(t("{{n}} items in {{place}}"), { n: 3, place: "cart" })).toBe("3 items in cart")
    })

    it("substitutes every occurrence of a repeated slot", () => {
        expect(sfmt(t("{{a}} and {{a}}"), { a: "x" })).toBe("x and x")
    })

    it("leaves unknown placeholders untouched", () => {
        expect(sfmt("Hello {{name}}" as Text<string>, {})).toBe("Hello {{name}}")
    })

    it("returns strings without placeholders unchanged", () => {
        expect(sfmt(t("plain text"), {})).toBe("plain text")
    })

    it("leaves tags as-is", () => {
        expect(sfmt(t("<b>bold</b> and <br/>"), {})).toBe("<b>bold</b> and <br/>")
        expect(sfmt(t("click <b>{{label}}</b>"), { label: "here" })).toBe("click <b>here</b>")
    })
})

describe("fmt", () => {
    it("returns a plain string when given only slot values", () => {
        expect(fmt(t("Hello {{name}}"), { name: "World" })).toBe("Hello World")
    })

    it("passes tag contents through the matching tag function", () => {
        const result = fmt(t("click <b>here</b>"), {
            b: (content) => `bold(${content})`,
        })

        expect(result).toEqual(["click ", "bold(here)"])
    })

    it("substitutes slots inside tag contents", () => {
        const result = fmt(t("open <link>{{page}}</link> now"), {
            page: "docs",
            link: (content) => `link(${content})`,
        })

        expect(result).toEqual(["open ", "link(docs)", " now"])
    })

    it("renders nested tags inside out", () => {
        const result = fmt(t("<outer>a <inner>b</inner> c</outer>"), {
            outer: (content) => ({ outer: content }) as unknown as GnimNode,
            inner: (content) => ({ inner: content }) as unknown as GnimNode,
        })

        expect(result).toEqual([{ outer: ["a ", { inner: ["b"] }, " c"] }])
    })

    it("calls self-closing tag functions with empty content", () => {
        const result = fmt(t("a<br/>b"), {
            br: (content) => {
                expect(content).toEqual([])
                return "\n"
            },
        })

        expect(result).toEqual(["a", "\n", "b"])
    })

    describe("markup parsing edge cases", () => {
        it("closes unclosed tags at the end of the input", () => {
            const result = rawFmt("start <b>rest", {
                b: (content) => ({ bold: content }) as unknown as GnimNode,
            })

            expect(result).toEqual(["start ", { bold: ["rest"] }])
        })

        it("splices in the content of tags without a matching function", () => {
            const result = rawFmt("a <unknown>b</unknown> c", {
                other: (content) => content,
            })

            expect(result).toEqual(["a ", ["b"], " c"])
        })

        it("matches tag names case-insensitively against lowercase keys", () => {
            const result = rawFmt("<B>loud</B>", {
                b: (content) => ({ bold: content }) as unknown as GnimNode,
            })

            expect(result).toEqual([{ bold: ["loud"] }])
        })

        it("parses tags that carry attributes", () => {
            const result = fmt(t('<a href="https://example.com">link</a>'), {
                a: (content) => ({ anchor: content }) as unknown as GnimNode,
            })

            expect(result).toEqual([{ anchor: ["link"] }])
        })

        it("ignores stray closing tags", () => {
            const result = fmt(t("a</b>c"), {
                b: (content) => content,
            })

            expect(result).toEqual(["a", "c"])
        })
    })
})
