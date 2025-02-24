import Fragment from "./Fragment.js"
import { Binding, sync } from "../state.js"

interface WhenProps<T> {
    value: Binding<T>
    children: (value: T) => JSX.Element | "" | false | null | undefined
    cleanup?: (element: JSX.Element) => void
}

export default function When<T>({ value, children, cleanup }: WhenProps<T>) {
    const fragment = new Fragment<JSX.Element>()

    sync(fragment, "children", value.as((v) => {
        for (const child of fragment.children) {
            fragment.removeChild(child)
            cleanup?.(child)
        }

        const ch = children(v)
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            fragment.addChild(ch)
        }

        return fragment.children
    }))

    return fragment
}
