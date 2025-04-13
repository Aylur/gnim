import GObject from "gi://GObject"
import { env } from "./env.js"

type Element = JSX.Element | "" | false | null | undefined

interface ThisProps<T> {
    this: T
    children?: Element | Array<Element>
}

/** @experimental */
export default function This<T extends GObject.Object>({ this: self, children }: ThisProps<T>) {
    if (Array.isArray(children)) {
        for (const ch of children) {
            if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
                env.addChild(self, ch, -1)
            }
        }
    } else {
        const ch = children
        if (ch !== "" && ch !== false && ch !== null && ch !== undefined) {
            env.addChild(self, ch, -1)
        }
    }

    return self
}
