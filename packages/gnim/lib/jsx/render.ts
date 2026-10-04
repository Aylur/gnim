import GObject from "gi://GObject?version=2.0"
import { kebabcase, snakecase } from "../util.js"
import {
    resolveNode,
    mountChildren,
    type CC,
    type CCProps,
    type FC,
    type GnimNode,
} from "./element.js"
import { createContext, isAccessor, untrack, type Accessor } from "./reactive.js"
import { createScope, Effect, onCleanup, runScope, setContext } from "./signal.js"

const RendererContext = createContext<Renderer | null>(null)

export const setChildren = Symbol("gnim.setChildren")
export const appendChild = Symbol("gnim.appendChild")
export const removeChild = Symbol("gnim.removeChild")

export class MissingMethodError extends Error {
    constructor(
        name: "removeChild" | "appendChild",
        parent: GObject.Object,
        child: GObject.Object,
    ) {
        super(`Missing "${name}" implementation for parent "${parent}" and child "${child}".`)
    }
}

/**
 * Gtk independent `Gtk.Buildable` alternative.
 * Return `false` to fallback to the default behavior.
 */
export interface Buildable {
    [setChildren]?(children: GObject.Object[], prev: GObject.Object[]): void | boolean
    [appendChild]?(child: GObject.Object): void | boolean
    [removeChild]?(child: GObject.Object): void | boolean
}

export function getRenderer(): Renderer {
    const renderer = RendererContext.use()
    if (!renderer) throw Error("cannot get renderer: out of tracking context")
    return renderer
}

export interface Renderer {
    resolveTag(tag: string): CC | FC
    constructObject(element: CC, props: Record<string, unknown>): GObject.Object
    createText(string: string): GObject.Object
    prepareProps(klass: CC, props: Record<string, unknown>): Record<string, unknown>
    setProperty(object: GObject.Object, key: string, value: unknown): void
    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void
    disposeObject(object: GObject.Object, parent?: GObject.Object): void
}

type SignalArray = Array<[string, (...props: unknown[]) => unknown]>
type AccessorArray = Array<[string, Accessor<unknown>]>

function isSignalHander(key: string, value: unknown): value is (...props: unknown[]) => unknown {
    return /^on[A-Z]/.test(key) && typeof value === "function"
}

function isObjectPropertyNode(constructor: CC, key: string, value: unknown): value is GnimNode {
    if (value instanceof GObject.Object) return false // no-op: no need to resolve the node

    const name = kebabcase(key)
    const pspec: GObject.ParamSpec | null = GObject.Object.find_property.call(constructor, name)
    return pspec !== null && GObject.type_is_a(pspec.value_type, GObject.TYPE_OBJECT)
}

export abstract class BaseRenderer implements Renderer {
    protected objectProperties = new Map<CC, Set<string>>()

    protected resolveChild(node: GnimNode, slot: string) {
        const [child, ...siblings] = resolveNode(node)

        if (siblings.length > 0 || !(child instanceof GObject.Object)) {
            throw Error(`invalid slot value: "${slot}" requires static JSX`)
        }

        return child
    }

    protected collectProps(constructor: CC, ccProps: CCProps<GObject.Object>) {
        const { children, ref, construct, ...rest } = ccProps
        const props = this.prepareProps(constructor, rest)
        const entries = Object.entries(props)

        const signals: SignalArray = []
        const accessors: AccessorArray = []

        for (const [key, value] of entries) {
            if (value === undefined) delete props[key]
        }

        for (const [key, value] of entries) {
            if (isSignalHander(key, value)) {
                signals.push([key, value])
                delete props[key]
                continue
            }

            if (isAccessor(value)) {
                accessors.push([key, value])
                delete props[key]
                continue
            }

            if (isObjectPropertyNode(constructor, key, value)) {
                props[key] = this.resolveChild(value, `${constructor.name}:${kebabcase(key)}`)
                continue
            }
        }

        return { children, ref, construct, props, signals, accessors }
    }

    protected hookupProps(object: GObject.Object, signals: SignalArray, accessors: AccessorArray) {
        for (const [name, handler] of signals) {
            const [signal, detail] = kebabcase(name.slice(2)).split(":")

            const s = signal.startsWith("notify-")
                ? `notify::${signal.slice(7)}`
                : detail
                  ? `${signal}::${detail}`
                  : signal

            const id = GObject.signal_connect(object, s, handler)
            onCleanup(() => GObject.signal_handler_disconnect(object, id))
        }

        for (const [prop, accessor] of accessors) {
            const effect = new Effect(() => {
                const value = accessor()
                untrack(() => this.setProperty(object, prop, value))
            })
            effect.run()
        }
    }

    protected newObject(constructor: CC, ccProps: CCProps<GObject.Object>) {
        const { children, ref, construct, props, signals, accessors } = this.collectProps(
            constructor,
            ccProps,
        )

        const object =
            construct instanceof GObject.Object
                ? construct
                : typeof construct === "function"
                  ? construct()
                  : new constructor(props)

        if (typeof ref === "function") {
            ref(object)
        } else {
            ref?.forEach((f) => f(object))
        }

        if (construct instanceof GObject.Object || typeof construct === "function") {
            for (const [key, value] of Object.entries(props)) {
                this.setProperty(object, key, value)
            }
        }

        mountChildren(children, object)
        this.hookupProps(object, signals, accessors)
        return object
    }

    resolveTag(tag: string): CC | FC {
        throw Error(`unresolved JSX tag: "${tag}"`)
    }

    abstract constructObject(element: CC, props: Record<string, unknown>): GObject.Object
    abstract createText(_string: string): GObject.Object

    prepareProps(_klass: CC, props: Record<string, unknown>): Record<string, unknown> {
        return props
    }

    setProperty(object: GObject.Object, key: string, value: unknown): void {
        const getter = `get_${snakecase(key)}` as keyof typeof object

        let current: unknown

        if (
            getter in object &&
            typeof object[getter] === "function" &&
            object[getter].length === 0
        ) {
            current = (object[getter] as () => unknown)()
        } else {
            current = object[key as keyof typeof object]
        }

        if (!Object.is(current, value)) {
            Object.assign(object, { [key]: value })
        }
    }

    abstract appendChild(parent: GObject.Object, child: GObject.Object): void
    abstract removeChild(parent: GObject.Object, child: GObject.Object): void

    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void {
        if (setChildren in parent && typeof parent[setChildren] === "function") {
            if (parent[setChildren](children, prev) !== false) return
        }

        for (const child of prev) {
            if (removeChild in parent && typeof parent[removeChild] === "function") {
                if (parent[removeChild](child) !== false) continue
            }
            this.removeChild(parent, child)
        }
        for (const child of children) {
            if (appendChild in parent && typeof parent[appendChild] === "function") {
                if (parent[appendChild](child) !== false) continue
            }
            this.appendChild(parent, child)
        }
    }

    disposeObject(_object: GObject.Object, _parent?: GObject.Object): void {
        // no-op
    }
}

/**
 * Render an element tree into `root` using the given {@link Renderer}.
 * The tree lives in a root scope; the returned function disposes it,
 * running every cleanup and destroying the widgets that were created.
 *
 * @returns Dispose function.
 */
export function render(renderer: Renderer, element: () => GnimNode, root?: GObject.Object) {
    const scope = createScope()
    runScope(scope, () => {
        setContext(RendererContext, renderer)
        mountChildren(untrack(element), root)
    })
    return () => scope.dispose()
}

export function newObject<C extends CC>(
    constructor: C,
    ccProps: CCProps<InstanceType<C>>,
): InstanceType<C> {
    return getRenderer().constructObject(constructor, ccProps) as InstanceType<C>
}
