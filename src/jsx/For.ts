import Fragment from "./Fragment.js"
import { Binding, State, sync } from "../state.js"

interface ForProps<T> {
    each: Binding<Array<T>>,
    children: (item: T, index: Binding<number>) => JSX.Element,
    cleanup?: (element: JSX.Element, item: T, index: number) => void,
}

export default function For<T extends object>({ each, children, cleanup }: ForProps<T>) {
    const map = new Map<T, { child: JSX.Element, index: State<number> }>()
    const fragment = new Fragment()

    sync(fragment, "children", each.as(arr => {
        // cleanup children missing from arr
        for (const [key, { child, index }] of map.entries()) {
            fragment.removeChild(child)

            if (arr.findIndex(i => i === key) < 0) {
                cleanup?.(child, key, index.get())
                map.delete(key)
            }
        }

        // update index and add new items
        arr.map((key, i) => {
            if (map.has(key)) {
                const { index, child } = map.get(key)!
                index.set(i)
                fragment.addChild(child)
            } else {
                const index = new State(i)
                const child = children(key, index())
                map.set(key, { child, index })
                fragment.addChild(child)
            }
        })

        return fragment.children
    }))

    return fragment
}
