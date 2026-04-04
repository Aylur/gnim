import Gdk from "gi://Gdk?version=4.0"
import Gtk from "gi://Gtk?version=4.0"
import { computed, onCleanup, type Accessor, type MaybeAccessor } from "../../jsx/reactive.js"
import type { Prettify } from "../../util.js"

Gtk.init()

function fnv1aHash(str: string) {
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = (hash * 0x01000193) >>> 0
    }
    return hash
}

function styleSheet(selector: string, style: Style): string[] {
    const nestedStyles: Array<[selector: string, Style]> = []
    const attributes: string[] = []

    for (const [key, value] of Object.entries(style)) {
        if (key.startsWith("&") && value) {
            nestedStyles.push([key.slice(1), value as Style])
        } else if (key.startsWith("@media") && value) {
            const attrs = Object.entries(value as CssProperties)
                .map(([name, value]) =>
                    typeof value === "string" || typeof value === "number"
                        ? `${name}: ${value};`
                        : "",
                )
                .join("")

            attributes.push(`${key} { ${attrs} }`)
        } else {
            if (typeof value === "string" || typeof value === "number") {
                attributes.push(`${key}: ${value};`)
            }
        }
    }

    const nested = nestedStyles
        .map(([pseudo, style]) => styleSheet(selector + pseudo, style))
        .flat()

    return [`${selector} { ${attributes.join("")} }`, ...nested]
}

function injectCss(stylesheet: string): () => void {
    const display = Gdk.Display.get_default()!

    const provider = new Gtk.CssProvider()
    provider.load_from_string(stylesheet)

    let id = provider.connect("parsing-error", (_, _section, error) => {
        console.error(`css error: ${error.message}`)
    })

    Gtk.StyleContext.add_provider_for_display(display, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    return () => {
        if (id > 0) {
            provider.disconnect(id)
            Gtk.StyleContext.remove_provider_for_display(display, provider)
            id = 0
        }
    }
}

const cache = new Map<string, { cleanup: () => void; counter: number }>()

function injectStyle(style: Style): [string, () => void] {
    const id = "s" + fnv1aHash(JSON.stringify(style)).toString(36)
    let css = cache.get(id)

    if (!css) {
        const cleanup = injectCss(styleSheet(`.${id}`, style).join(" "))
        cache.set(id, (css = { cleanup, counter: 1 }))
    } else {
        css.counter += 1
    }

    return [
        id,
        () => {
            css.counter -= 1
            setTimeout(() => {
                if (css.counter === 0 && cache.has(id)) {
                    cache.delete(id)
                    css.cleanup()
                }
            })
        },
    ]
}

function injectKeyframes(keyframes: Keyframes): [string, () => void] {
    const id = "k" + fnv1aHash(JSON.stringify(keyframes)).toString(36)
    const frames = Object.entries(keyframes).map(([frame, props]) => {
        const attributes = Object.entries(props)
            .map(([key, value]) => `${key}: ${value};`)
            .join("\n")

        const key = frame === "from" || frame === "to" ? frame : `${frame}%`
        return `${key} { ${attributes} }`
    })
    const cleanup = injectCss(`@keyframes ${id} { ${frames.join("\n")} }`)
    return [id, cleanup]
}

/** @experimental */
export function keyframes(keyframes: Keyframes): string

/** @experimental */
export function keyframes(keyframes: () => Keyframes): Accessor<string>

export function keyframes(k: Keyframes | (() => Keyframes)): MaybeAccessor<string> {
    if (typeof k === "function") {
        return computed(() => {
            const [style, cleanup] = injectKeyframes(k())
            onCleanup(cleanup)
            return style
        })
    }

    const [className, cleanup] = injectKeyframes(k)
    onCleanup(cleanup)
    return className
}

/** @experimental */
export function style(props: Style): string

/** @experimental */
export function style(producer: () => Style): Accessor<string>

export function style(s: Style | (() => Style)): MaybeAccessor<string> {
    if (typeof s === "function") {
        return computed(() => {
            const [style, cleanup] = injectStyle(s())
            onCleanup(cleanup)
            return style
        })
    }

    const [className, cleanup] = injectStyle(s)
    onCleanup(cleanup)
    return className
}

export type Keyframes =
    | { from: CssProperties; to: CssProperties }
    | { [Percentage in number]: CssProperties }

export type Style = Prettify<CssProperties & StyleProperties & MediaQuery>

export type CssProperties = {
    [P in CssProperty]?: string | number
}

type StyleProperties = {
    [K in `&${string}`]: StyleProperties & CssProperties & MediaQuery
}

type MediaQuery = {
    [K in `@media ${string}`]: CssProperties
}

/** https://docs.gtk.org/gtk4/css-properties.html#gtk-css-properties */
export type CssProperty =
    | `--${string}`
    | "all"
    | "color"
    | "opacity"
    | "filter"
    | "font-family"
    | "font-size"
    | "font-style"
    | "font-variant"
    | "font-weight"
    | "font-stretch"
    | "font-kerning"
    | "font-variant-ligatures"
    | "font-variant-position"
    | "font-variant-caps"
    | "font-variant-numeric"
    | "font-variant-alternates"
    | "font-variant-east-asian"
    | "font-feature-settings"
    | "font-variation-settings"
    | "-gtk-dpi"
    | "font"
    | "caret-color"
    | "-gtk-secondary-caret-color"
    | "letter-spacing"
    | "text-transform"
    | "line-height"
    | "text-decoration-line"
    | "text-decoration-color"
    | "text-decoration-style"
    | "text-shadow"
    | "text-decoration"
    | "-gtk-icon-source"
    | "-gtk-icon-size"
    | "-gtk-icon-style"
    | "-gtk-icon-transform"
    | "-gtk-icon-palette"
    | "-gtk-icon-shadow"
    | "-gtk-icon-filter"
    | "transform"
    | "transform-origin"
    | "min-width"
    | "min-height"
    | "margin-top"
    | "margin-right"
    | "margin-bottom"
    | "margin-left"
    | "padding-top"
    | "padding-right"
    | "padding-bottom"
    | "padding-left"
    | "margin"
    | "padding"
    | "border-top-width"
    | "border-right-width"
    | "border-bottom-width"
    | "border-left-width"
    | "border-top-style"
    | "border-right-style"
    | "border-bottom-style"
    | "border-left-style"
    | "border-top-right-radius"
    | "border-bottom-right-radius"
    | "border-bottom-left-radius"
    | "border-top-left-radius"
    | "border-top-color"
    | "border-right-color"
    | "border-bottom-color"
    | "border-left-color"
    | "border-image-source"
    | "border-image-repeat"
    | "border-image-slice"
    | "border-image-width"
    | "border-width"
    | "border-style"
    | "border-color"
    | "border-top"
    | "border-right"
    | "border-bottom"
    | "border-left"
    | "border"
    | "border-radius"
    | "border-image"
    | "outline-style"
    | "outline-width"
    | "outline-color"
    | "outline-offset"
    | "outline"
    | "background-color"
    | "background-clip"
    | "background-origin"
    | "background-size"
    | "background-position"
    | "background-repeat"
    | "background-image"
    | "box-shadow"
    | "background-blend-mode"
    | "background"
    | "transition-property"
    | "transition-duration"
    | "transition-timing-function"
    | "transition-delay"
    | "transition"
    | "animation-name"
    | "animation-duration"
    | "animation-timing-function"
    | "animation-iteration-count"
    | "animation-direction"
    | "animation-play-state"
    | "animation-delay"
    | "animation-fill-mode"
    | "animation"
    | "border-spacing"
