import Gtk from "gi://Gtk?version=4.0"
import Gdk from "gi://Gdk?version=4.0"

export function css(css: TemplateStringsArray, ...values: any[]): () => void
export function css(css: string): () => void
export function css(css: TemplateStringsArray | string, ...values: any[]): () => void {
    const style = typeof css === "string"
        ? css
        : css
            .flatMap((str, i) => str + `${values[i] ?? ""}`)
            .join("")

    const provider = new Gtk.CssProvider()

    try {
        provider.load_from_string(style)
    } catch (err) {
        logError(err)
    }

    const display = Gdk.Display.get_default()
    if (!display) {
        throw Error("Could not get default Gdk.Display")
    }

    Gtk.StyleContext.add_provider_for_display(
        display, provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)

    return () => {
        Gtk.StyleContext.remove_provider_for_display(display, provider)
    }
}
