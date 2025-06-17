import GObject from "gi://GObject"
import { env } from "./env.js"
import { Accessor } from "./state.js"
import { kebabify, Pascalify, set } from "../util.js"
import { onCleanup } from "./scope.js"
import { setType } from "./jsx.js"

type Element = JSX.Element | "" | false | null | undefined

type ThisProps<Self extends GObject.Object> = {
    this: Self
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed to class component constructors
     */
    $type?: string

    children?: Element | Array<Element>
    /**
     * CSS class names
     */
    class?: string | Accessor<string>
    /**
     * inline CSS
     */
    css?: string | Accessor<string>
} & {
    [K in keyof Self]?: Self[K] | Accessor<NonNullable<Self[K]>>
} & {
    [S in keyof Self["$signals"] as S extends `notify::${infer P}`
        ? `onNotify${Pascalify<P>}`
        : S extends string
          ? `on${Pascalify<S>}`
          : never]?: GObject.SignalCallback<Self, Self["$signals"][S]>
}

// TODO:
// consider making this component a potential substitute for `createRoot()`
// disposing the scope using a destroy signal

/** @experimental */
export function This<T extends GObject.Object>({
    this: self,
    children,
    $type,
    ...props
}: ThisProps<T>) {
    const cleanup = new Array<() => void>()

    if ($type) setType(self, $type)

    for (const [key, value] of Object.entries(props)) {
        if (key === "css") {
            if (value instanceof Accessor) {
                env.setCss(self, value.get())
                cleanup.push(value.subscribe(() => env.setCss(self, value.get())))
            } else if (typeof value === "string") {
                env.setCss(self, value)
            }
        } else if (key === "class") {
            if (value instanceof Accessor) {
                env.setClass(self, value.get())
                cleanup.push(value.subscribe(() => env.setClass(self, value.get())))
            } else if (typeof value === "string") {
                env.setClass(self, value)
            }
        } else if (key.startsWith("on")) {
            const id = key.startsWith("onNotify")
                ? self.connect(`notify::${kebabify(key.slice(8))}`, value)
                : self.connect(kebabify(key.slice(2)), value)

            cleanup.push(() => self.disconnect(id))
        } else if (value instanceof Accessor) {
            set(self, key, value.get())
            cleanup.push(value.subscribe(() => set(self, key, value.get())))
        } else {
            set(self, key, value)
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

    if (cleanup.length > 0) {
        onCleanup(() => cleanup.forEach((cb) => cb()))
    }

    return self
}
