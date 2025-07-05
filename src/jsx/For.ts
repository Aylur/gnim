import { Fragment } from "./Fragment.js"
import { Accessor, State, createState } from "./state.js"
import { env } from "./env.js"
import { getScope, onCleanup, Scope } from "./scope.js"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Clutter from "gi://Clutter"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Gtk from "gi://Gtk?version=3.0"

interface ForProps<Item, El extends JSX.Element, Key> {
    each: Accessor<Iterable<Item>>
    children: (item: Item, index: Accessor<number>) => El

    /**
     * Function to run for each removed element.
     * The default value depends on the environment:
     *
     * - **Gtk4**: null
     * - **Gtk3**: {@link Gtk.Widget.prototype.destroy}
     * - **Gnome**: {@link Clutter.Actor.prototype.destroy}
     */
    cleanup?: null | ((element: El, item: Item, index: number) => void)

    /**
     * Function that generates the key for each item.
     *
     * By default items are mapped by:
     * - value in case of primitive values
     * - reference otherwise
     */
    id?: (item: Item) => Key | Item
}

// TODO: support Gio.ListModel

export function For<Item, El extends JSX.Element, Key>({
    each,
    children: mkChild,
    cleanup,
    id = (item: Item) => item,
}: ForProps<Item, El, Key>): Fragment<El> {
    type MapItem = { item: Item; child: El; index: State<number>; scope: Scope }

    const currentScope = getScope()
    const map = new Map<Item | Key, MapItem>()
    const fragment = new Fragment<El>()

    function remove({ item, child, index: [index], scope }: MapItem) {
        if (typeof cleanup === "function") {
            cleanup(child, item, index.get())
        } else if (cleanup !== null) {
            env.defaultCleanup(child)
        }
        scope.dispose()
    }

    function callback(itareable: Iterable<Item>) {
        const items = [...itareable]
        const ids = items.map(id)
        const idSet = new Set(ids)

        // cleanup children missing from arr
        for (const [key, value] of map.entries()) {
            // there is no generic way to insert child at index
            // so we sort by removing every child and reappending in order
            fragment.removeChild(value.child)

            if (!idSet.has(key)) {
                remove(value)
                map.delete(key)
            }
        }

        // update index and add new items
        items.map((item, i) => {
            const key = ids[i]
            if (map.has(key)) {
                const {
                    index: [, setIndex],
                    child,
                } = map.get(key)!
                setIndex(i)
                if (fragment.hasChild(child)) {
                    console.warn(`duplicate keys found: ${key}`)
                } else {
                    fragment.addChild(child)
                }
            } else {
                const [index, setIndex] = createState(i)
                const scope = new Scope(currentScope)
                const child = scope.run(() => mkChild(item, index))
                map.set(key, { item, child, index: [index, setIndex], scope })
                fragment.addChild(child)
            }
        })
    }

    const dispose = each.subscribe(() => {
        callback(each.get())
    })
    callback(each.get())

    onCleanup(() => {
        dispose()

        for (const value of map.values()) {
            remove(value)
        }

        map.clear()
    })

    return fragment
}
