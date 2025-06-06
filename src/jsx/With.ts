import Fragment from "./Fragment.js"
import { Accessor, hook } from "../state.js"
import { env } from "./env.js"
import { Scope } from "./context.js"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type GObject from "gi://GObject"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Clutter from "gi://Clutter"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Gtk from "gi://Gtk?version=3.0"

interface WithProps<T, E extends JSX.Element> {
    value: Accessor<T>
    children: (value: T) => E | "" | false | null | undefined

    /**
     * Function to run for each removed element.
     * The default value depends on the environment:
     *
     * - **Gtk4**: {@link GObject.Object.prototype.run_dispose}
     * - **Gtk3**: {@link Gtk.Widget.prototype.destroy}
     * - **Gnome**: {@link Clutter.Actor.prototype.destroy}
     */
    cleanup?: null | ((element: E) => void)
}

export default function With<T, E extends JSX.Element>({
    value,
    children: mkChild,
    cleanup,
}: WithProps<T, E>): Fragment<E> {
    const fragment = new Fragment<E>()
    const scope = Scope.current

    function callback(v: T) {
        for (const child of fragment.children) {
            fragment.removeChild(child)

            if (typeof cleanup === "function") {
                cleanup(child)
            } else if (cleanup !== null) {
                env.defaultCleanup(child)
            }
        }

        const ch = Scope.with(() => mkChild(v), scope)
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.addChild(ch)
        }
    }

    hook(fragment, value, () => callback(value.get()))
    callback(value.get())

    return fragment
}
