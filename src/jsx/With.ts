import { Fragment } from "./Fragment.js"
import { Accessor } from "./state.js"
import { env } from "./env.js"
import { getScope, onCleanup, Scope } from "./scope.js"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Clutter from "gi://Clutter"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Gtk from "gi://Gtk?version=3.0"

interface WithProps<T, E extends JSX.Element> {
    value: Accessor<T>
    children: (value: T) => E | "" | false | null | undefined

    /**
     * Function to run for each removed element.
     * The default value depends on the environment:
     *
     * - **Gtk4**: null
     * - **Gtk3**: {@link Gtk.Widget.prototype.destroy}
     * - **Gnome**: {@link Clutter.Actor.prototype.destroy}
     */
    cleanup?: null | ((element: E) => void)
}

export function With<T, E extends JSX.Element>({
    value,
    children: mkChild,
    cleanup,
}: WithProps<T, E>): Fragment<E> {
    const currentScope = getScope()
    const fragment = new Fragment<E>()

    let scope: Scope

    function callback(v: T) {
        for (const child of fragment.children) {
            fragment.removeChild(child)

            if (typeof cleanup === "function") {
                cleanup(child)
            } else if (cleanup !== null) {
                env.defaultCleanup(child)
            }

            if (scope) scope.dispose()
        }

        scope = new Scope(currentScope)
        const ch = scope.run(() => mkChild(v))
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.addChild(ch)
        }
    }

    const dispose = value.subscribe(() => {
        callback(value.get())
    })
    callback(value.get())

    onCleanup(() => {
        scope.dispose()
        dispose()
    })

    return fragment
}
