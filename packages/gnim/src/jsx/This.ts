import GObject from "gi://GObject?version=2.0"
import { env } from "./env.js"
import { Accessor, createEffect } from "./state.js"
import { set, type CamelCase, type Keyof, type PascalCase, type Reactive } from "../util.js"
import { onCleanup } from "./scope.js"
import { append, setType, signalName, type Node } from "./jsx.js"

type ThisProps<T extends GObject.Object> = {
    this: T
} & Partial<
    {
        children: Array<Node> | Node
        $type: string
        class: Reactive<string>
        css: Reactive<string>
    } & {
        // writable reactive properties
        [K in Keyof<T["$writableProperties"]> as CamelCase<K>]: Reactive<
            T["$writableProperties"][K]
        >
    } & {
        // onSignalName and onDetaliedSignal:detail
        [S in Keyof<T["$signals"]> as S extends `${infer Name}::{}`
            ? `on${PascalCase<Name>}:${string}`
            : `on${PascalCase<S>}`]: GObject.SignalCallback<T, T["$signals"][S]>
    } & {
        // onNotifyProperty
        [S in Keyof<
            T["$readableProperties"]
        > as `onNotify${PascalCase<S>}`]: GObject.SignalCallback<
            T,
            (pspec: GObject.ParamSpec<T["$readableProperties"][S]>) => void
        >
    }
>

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
                createEffect(() => env.setCss(self, value()), { immediate: true })
            } else if (typeof value === "string") {
                env.setCss(self, value)
            }
        } else if (key === "class") {
            if (value instanceof Accessor) {
                createEffect(() => env.setClass(self, value()), { immediate: true })
            } else if (typeof value === "string") {
                env.setClass(self, value)
            }
        } else if (key.startsWith("on")) {
            const id = self.connect(signalName(key) as never, value)
            cleanup.push(() => self.disconnect(id))
        } else if (value instanceof Accessor) {
            createEffect(() => set(self, key, value()), { immediate: true })
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
