import GObject from "gi://GObject"
import { env } from "./env.js"
import { Binding, sync } from "../state.js"
import { kebabify } from "../util.js"

type Element = JSX.Element | "" | false | null | undefined

type ThisProps<Self extends GObject.Object> = {
    this: Self
    children?: Element | Array<Element>
    /**
     * CSS class names
     */
    class?: string | Binding<string>
    /**
     * inline CSS
     */
    css?: string | Binding<string>
} & {
    [K in keyof Self]?: Self[K] | Binding<NonNullable<Self[K]>>
} & {
    [Key in `$${string}`]: (self: Self, ...args: any[]) => any
}

/** @experimental */
export default function This<T extends GObject.Object>({
    this: self,
    children,
    ...props
}: ThisProps<T>) {
    for (const [key, value] of Object.entries(props)) {
        if (key === "css") {
            if (value instanceof Binding) {
                value.subscribe(self, (css) => env.setCss(self, css))
                env.setCss(self, value.get())
            } else if (typeof value === "string") {
                env.setCss(self, value)
            }
        } else if (key === "class") {
            if (value instanceof Binding) {
                value.subscribe(self, (classes) => env.setClass(self, classes))
                env.setClass(self, value.get())
            } else if (typeof value === "string") {
                env.setClass(self, value)
            }
        } else if (key.startsWith("$")) {
            if (key.startsWith("$$")) {
                self.connect(`notify::${kebabify(key.slice(2))}`, value)
            } else {
                self.connect(kebabify(key.slice(1)), value)
            }
        } else if (value instanceof Binding) {
            sync(self, key as Extract<keyof T, string>, value)
        } else {
            self[key as keyof T] = value
        }
    }

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
