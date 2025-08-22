import GObject from "gi://GObject"
import { env } from "./env.js"
import { Accessor } from "./state.js"
import { set } from "../util.js"
import { onCleanup } from "./scope.js"
import { append, setType, signalName, type CCProps } from "./jsx.js"

type ThisProps<Self extends GObject.Object> = Partial<
    Omit<CCProps<Self, { [K in keyof Self]: Self[K] }>, "$" | "$constructor">
> & {
    this: Self
}

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
            const id = self.connect(signalName(key), value)
            cleanup.push(() => self.disconnect(id))
        } else if (value instanceof Accessor) {
            const dispose = value.subscribe(() => set(self, key, value.get()))
            set(self, key, value.get())
            cleanup.push(dispose)
        } else {
            set(self, key, value)
        }
    }

    for (let child of Array.isArray(children) ? children : [children]) {
        if (child === true) {
            console.warn(Error("Trying to add boolean value of `true` as a child."))
            continue
        }

        if (Array.isArray(child)) {
            for (const ch of child) {
                append(self, ch)
            }
        } else if (child) {
            if (!(child instanceof GObject.Object)) {
                child = env.textNode(child)
            }
            append(self, child)
        }
    }

    if (cleanup.length > 0) {
        onCleanup(() => cleanup.forEach((cb) => cb()))
    }

    return self
}
