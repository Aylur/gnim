import Fragment from "./Fragment.js"
import { Binding, State } from "../state.js"

interface ForProps<T> {
    each: Binding<Array<T>>
    children: (item: T, index: Binding<number>) => JSX.Element
    cleanup?: (element: JSX.Element, item: T, index: number) => void | null
}

// TODO: support Gio.ListModel

export default function For<T extends object>({
    each,
    children: mkChild,
    cleanup = item => item.run_dispose(),
}: ForProps<T>): Fragment<JSX.Element> {
    const map = new Map<T, { child: JSX.Element, index: State<number> }>()
    const fragment = new Fragment<JSX.Element>()

    function callback(arr: T[]) {
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
                const child = mkChild(key, index())
                map.set(key, { child, index })
                fragment.addChild(child)
            }
        })
    }

    each.subscribe(fragment, callback)
    callback(each.get())

    return fragment
}
