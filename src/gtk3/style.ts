import Gtk from "gi://Gtk?version=3.0"
import Gdk from "gi://Gdk?version=3.0"

const stylesheets: string[] = []

/** @experimental */
export function apply() {
    const provider = new Gtk.CssProvider()

    try {
        provider.load_from_data(stylesheets.join(" "))
    } catch (err) {
        logError(err)
    }

    const screen = Gdk.Screen.get_default()
    if (!screen) {
        throw Error("Could not get default Gdk.Screen")
    }

    Gtk.StyleContext.add_provider_for_screen(screen, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    return () => {
        Gtk.StyleContext.remove_provider_for_screen(screen, provider)
    }
}

export function css(css: TemplateStringsArray, ...values: any[]): void
export function css(css: string): void
export function css(css: TemplateStringsArray | string, ...values: any[]) {
    const style =
        typeof css === "string" ? css : css.flatMap((str, i) => str + `${values[i] ?? ""}`).join("")

    stylesheets.push(style)
}
