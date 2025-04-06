import Fragment from "./Fragment.js"
import { Binding, State } from "../state.js"

interface ForProps<T, E extends JSX.Element> {
    each: Binding<Array<T>>
    children: (item: T, index: Binding<number>) => E
    cleanup: "destroy" | "run_dispose" | ((element: E, item: T, index: number) => void) | null
}

// TODO: support Gio.ListModel

export default function For<T extends object, E extends JSX.Element>({
    each,
    children: mkChild,
    cleanup,
}: ForProps<T, E>): Fragment<E> {
    const map = new Map<T, { child: E; index: State<number> }>()
    const fragment = new Fragment<E>()

    function callback(arr: T[]) {
        // cleanup children missing from arr
        for (const [key, { child, index }] of map.entries()) {
            fragment.removeChild(child)

            if (arr.findIndex((i) => i === key) < 0) {
                if (typeof cleanup === "function") {
                    cleanup(child, key, index.get())
                } else if (typeof cleanup === "string") {
                    const ch = child as any
                    if (typeof ch[cleanup] === "function") {
                        ch[cleanup]()
                    } else {
                        console.warn(`cleanup "${cleanup}" function is undefined on ${child}`)
                    }
                }
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

    if (each instanceof Binding) {
        each.subscribe(fragment, callback)
        callback(each.get())
    }

    return fragment
}
