import { Fragment } from "./Fragment.js"
import { Accessor } from "./state.js"
import { env } from "./env.js"
import { getScope, onCleanup, Scope } from "./scope.js"

interface WithProps<T, E extends JSX.Element> {
    value: Accessor<T>
    children: (value: T) => E | "" | false | null | undefined

    /**
     * Function to run for each removed element.
     * The default value depends on the environment:
     *
     * - **Gtk4**: null
     * - **Gtk3**: Gtk.Widget.prototype.destroy
     * - **Gnome**: Clutter.Actor.prototype.destroy
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

    let currentValue: T
    let scope: Scope

    function remove(child: E) {
        fragment.remove(child)
        if (scope) scope.dispose()

        if (typeof cleanup === "function") {
            cleanup(child)
        } else if (cleanup !== null) {
            env.defaultCleanup(child)
        }
    }

    function callback(v: T) {
        for (const child of fragment) {
            remove(child)
        }

        scope = new Scope(currentScope)
        const ch = scope.run(() => mkChild(v))
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.append(ch)
        }
    }

    const dispose = value.subscribe(() => {
        const newValue = value.get()
        if (currentValue === newValue) {
            callback((currentValue = newValue))
        }
    })

    currentValue = value.get()
    callback(currentValue)

    onCleanup(() => {
        dispose()
        for (const child of fragment) {
            remove(child)
        }
    })

    return fragment
}
