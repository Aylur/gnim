import Fragment from "./Fragment.js"
import { Binding, State } from "../state.js"
import { env } from "./env.js"

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type GObject from "gi://GObject"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Clutter from "gi://Clutter"
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type Gtk from "gi://Gtk?version=3.0"

interface ForProps<Item, El extends JSX.Element, Key> {
    each: Binding<Array<Item>>
    children: (item: Item, index: Binding<number>) => El

    /**
     * Function to run for each removed element.
     * The default value depends on the environment:
     *
     * - **Gtk4**: {@link GObject.Object.prototype.run_dispose}
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

export default function For<Item, El extends JSX.Element, Key>({
    each,
    children: mkChild,
    cleanup,
    id = (item: Item) => item,
}: ForProps<Item, El, Key>): Fragment<El> {
    const map = new Map<Item | Key, { item: Item; child: El; index: State<number> }>()
    const fragment = new Fragment<El>()

    function callback(items: Item[]) {
        // cleanup children missing from arr
        for (const [key, { item, child, index }] of map.entries()) {
            fragment.removeChild(child)

            if (items.findIndex((item) => id(item) === key) < 0) {
                if (typeof cleanup === "function") {
                    cleanup(child, item, index.get())
                } else if (cleanup !== null) {
                    env.defaultCleanup(child)
                }
                map.delete(key)
            }
        }

        // update index and add new items
        items.map((item, i) => {
            const key = id(item)
            if (map.has(key)) {
                const { index, child } = map.get(key)!
                index.set(i)
                if (fragment.hasChild(child)) {
                    console.warn(`duplicate keys found: ${key}`)
                } else {
                    fragment.addChild(child)
                }
            } else {
                const index = new State(i)
                const child = mkChild(item, index())
                map.set(item, { item, child, index })
                fragment.addChild(child)
            }
        })
    }

    if (each instanceof Binding) {
        each.subscribe(fragment, callback)
        callback(each.get())
    }

    return fragment
}
