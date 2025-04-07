import Fragment from "./Fragment.js"
import { Binding } from "../state.js"

interface WithProps<T, E extends JSX.Element> {
    value: Binding<T>
    children: (value: T) => E | "" | false | null | undefined
    cleanup: "destroy" | "run_dispose" | ((element: E) => void) | null
}

export default function With<T, E extends JSX.Element>({
    value,
    children: mkChild,
    cleanup,
}: WithProps<T, E>): Fragment<E> {
    const fragment = new Fragment<E>()

    function callback(v: T) {
        for (const child of fragment.children) {
            fragment.removeChild(child)

            if (typeof cleanup === "function") {
                cleanup(child)
            } else if (typeof cleanup === "string") {
                const ch = child as any
                if (typeof ch[cleanup] === "function") {
                    ch[cleanup]()
                } else {
                    console.warn(`cleanup "${cleanup}" function is undefined on ${child}`)
                }
            }
        }

        const ch = mkChild(v)
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.addChild(ch)
        }
    }

    value.subscribe(fragment, callback)
    callback(value.get())

    return fragment
}
