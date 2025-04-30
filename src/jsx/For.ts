import Fragment from "./Fragment.js"
import { Binding, State } from "../state.js"
import { env } from "./env.js"

interface ForProps<T, E extends JSX.Element> {
    each: Binding<Array<T>>
    children: (item: T, index: Binding<number>) => E
    cleanup?: null | ((element: E, item: T, index: number) => void)
    id?: (item: T) => any
}

// TODO: support Gio.ListModel

export default function For<T extends object, E extends JSX.Element>({
    each,
    children: mkChild,
    cleanup,
    id,
}: ForProps<T, E>): Fragment<E> {
    const map = new Map<T, { child: E; index: State<number> }>()
    const fragment = new Fragment<E>()

    function getId(item: T) {
        if (id) {
            return id(item)
        }
        return item
    }

    function callback(arr: T[]) {
        const ids = arr.map(getId)
        const idSet = new Set(ids)

        for (const [id, { child, index }] of map.entries()) {
            fragment.removeChild(child)

            if (!idSet.has(id)) {
                if (typeof cleanup === "function") {
                    cleanup(child, id, index.get())
                } else if (cleanup !== null) {
                    env.defaultCleanup(child)
                }
                map.delete(id)
            }
        }

        // Update index and add new items
        arr.forEach((el, i) => {
            const id = ids[i]
            if (map.has(id)) {
                const { index, child } = map.get(id)!
                index.set(i)
                fragment.addChild(child)
            } else {
                const index = new State(i)
                const child = mkChild(el, index())
                map.set(id, { child, index })
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
