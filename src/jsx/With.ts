import Fragment from "./Fragment.js"
import { Binding } from "../state.js"
import { env } from "./env.js"

interface WithProps<T, E extends JSX.Element> {
    value: Binding<T>
    children: (value: T) => E | "" | false | null | undefined
    cleanup?: (element: E) => void
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
            } else {
                env.defaultCleanup(child)
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
