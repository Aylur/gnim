import GObject from "gi://GObject"
import { Fragment } from "./Fragment.js"
import { Accessor } from "./state.js"
import { type CC, type FC, env } from "./env.js"
import { kebabify, type Pascalify, set } from "../util.js"
import { onCleanup } from "./scope.js"

/**
 * Represents all of the things that can be passed as a child to class components.
 */
export type Node =
    | Array<GObject.Object>
    | GObject.Object
    | number
    | string
    | boolean
    | null
    | undefined

export const gtkType = Symbol("gtk builder type")

/**
 * Special symbol which lets you implement how widgets are appended in JSX.
 *
 * Example:
 *
 * ```ts
 * class MyComponent extends GObject.Object {
 *   [appendChild](child: GObject.Object, type: string | null) {
 *     // implement
 *   }
 * }
 * ```
 */
export const appendChild = Symbol("JSX add child method")

/**
 * Special symbol which lets you implement how widgets are removed in JSX.
 *
 * Example:
 *
 * ```ts
 * class MyComponent extends GObject.Object {
 *   [removeChild](child: GObject.Object) {
 *     // implement
 *   }
 * }
 * ```
 */
export const removeChild = Symbol("JSX add remove method")

/**
 * Get the type of the object specified through the `$type` property
 */
export function getType(object: GObject.Object) {
    return gtkType in object ? (object[gtkType] as string) : null
}

/**
 * Function Component Properties
 */
export type FCProps<Self, Props> = Props & {
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed as a parameters
     */
    $type?: string
    /**
     * setup function
     * its consumed internally and not actually passed as a parameters
     */
    $?(self: Self): void
}

/**
 * Class Component Properties
 */
export type CCProps<Self extends GObject.Object, Props> = {
    /**
     * @internal children elements
     * its consumed internally and not actually passed to class component constructors
     */
    children?: Array<Node> | Node
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed to class component constructors
     */
    $type?: string
    /**
     * function to use as a constructor,
     * its consumed internally and not actually passed to class component constructors
     */
    $constructor?(props: Partial<Props>): Self
    /**
     * setup function,
     * its consumed internally and not actually passed to class component constructors
     */
    $?(self: Self): void
    /**
     * CSS class names
     */
    class?: string | Accessor<string>
    /**
     * inline CSS
     */
    css?: string | Accessor<string>
} & {
    [K in keyof Props]: Accessor<NonNullable<Props[K]>> | Props[K]
} & {
    [S in keyof Self["$signals"] as S extends `notify::${infer P}`
        ? `onNotify${Pascalify<P>}`
        : S extends `${infer E}::${infer D}`
          ? `on${Pascalify<`${E}:${D}`>}`
          : S extends string
            ? `on${Pascalify<S>}`
            : never]?: GObject.SignalCallback<Self, Self["$signals"][S]>
}

// prettier-ignore
type JsxProps<C, Props> =
    C extends typeof Fragment ? (Props & {})
    // intrinsicElements always resolve as FC
    // so we can't narrow it down, and in some cases
    // the setup function is typed as a union of Object and actual type
    // as a fix users can and should use FCProps
    : C extends FC ? Props & Omit<FCProps<ReturnType<C>, Props>, "$">
    : C extends CC ? CCProps<InstanceType<C>, Props>
    : never

function isGObjectCtor(ctor: any): ctor is CC {
    return ctor.prototype instanceof GObject.Object
}

function isFunctionCtor(ctor: any): ctor is FC {
    return typeof ctor === "function" && !isGObjectCtor(ctor)
}

// onNotifyPropName -> notify::prop-name
// onPascalName:detailName -> pascal-name::detail-name
export function signalName(key: string): string {
    const [sig, detail] = kebabify(key.slice(2)).split(":")

    if (sig.startsWith("notify-")) {
        return `notify::${sig.slice(7)}`
    }

    return detail ? `${sig}::${detail}` : sig
}

export function remove(parent: GObject.Object, child: GObject.Object) {
    if (parent instanceof Fragment) {
        parent.remove(child)
        return
    }

    if (removeChild in parent && typeof parent[removeChild] === "function") {
        parent[removeChild](child)
        return
    }

    env.removeChild(parent, child)
}

export function append(parent: GObject.Object, child: GObject.Object) {
    if (parent instanceof Fragment) {
        parent.append(child)
        return
    }

    if (appendChild in parent && typeof parent[appendChild] === "function") {
        parent[appendChild](child, getType(child))
        return
    }

    if (child instanceof Fragment) {
        for (const ch of child) {
            append(parent, ch)
        }

        const appendHandler = child.connect("append", (_, ch) => {
            if (!(ch instanceof GObject.Object)) {
                return console.error(TypeError(`cannot add ${ch} to ${parent}`))
            }
            append(parent, ch)
        })

        const removeHandler = child.connect("remove", (_, ch) => {
            if (!(ch instanceof GObject.Object)) {
                return console.error(TypeError(`cannot remove ${ch} from ${parent}`))
            }
            remove(parent, ch)
        })

        onCleanup(() => {
            child.disconnect(appendHandler)
            child.disconnect(removeHandler)
        })

        return
    }

    if (child) {
        if (!(child instanceof GObject.Object)) {
            child = env.textNode(child)
        }
        env.appendChild(parent, child)
    }
}

/** @internal */
export function setType(object: object, type: string) {
    if (gtkType in object && object[gtkType] !== "") {
        console.warn(`type overriden from ${object[gtkType]} to ${type} on ${object}`)
    }

    Object.assign(object, { [gtkType]: type })
}

export function jsx<T extends (props: any) => GObject.Object>(
    ctor: T,
    props: JsxProps<T, Parameters<T>[0]>,
): ReturnType<T>

export function jsx<T extends new (props: any) => GObject.Object>(
    ctor: T,
    props: JsxProps<T, ConstructorParameters<T>[0]>,
): InstanceType<T>

export function jsx<T extends GObject.Object>(
    ctor: keyof (typeof env)["intrinsicElements"] | (new (props: any) => T) | ((props: any) => T),
    inprops: any,
    // key is a special prop in jsx which is passed as a third argument and not in props
    key?: string,
): T {
    const { $, $type, $constructor, children, ...rest } = inprops as CCProps<T, any>
    const props = rest as Record<string, any>

    if (key) Object.assign(props, { key })

    const deferProps = env.initProps(ctor, props) ?? []
    const deferredProps: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(props)) {
        if (value === undefined) {
            delete props[key]
        }

        if (deferProps.includes(key)) {
            deferredProps[key] = props[key]
            delete props[key]
        }
    }

    if (typeof ctor === "string") {
        if (ctor in env.intrinsicElements) {
            ctor = env.intrinsicElements[ctor] as FC<T> | CC<T>
        } else {
            throw Error(`unknown intrinsic element "${ctor}"`)
        }
    }

    if (isFunctionCtor(ctor)) {
        const object = ctor({ children, ...props })
        if ($type) setType(object, $type)
        $?.(object)
        return object
    }

    // collect css and className
    const { css, class: className } = props
    delete props.css
    delete props.class

    const signals: Array<[string, (...props: unknown[]) => unknown]> = []
    const bindings: Array<[string, Accessor<unknown>]> = []

    // collect signals and bindings
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("on")) {
            signals.push([key, value as () => unknown])
            delete props[key]
        }
        if (value instanceof Accessor) {
            bindings.push([key, value])
            props[key] = value.get()
        }
    }

    // construct
    const object = $constructor ? $constructor(props) : new (ctor as CC<T>)(props)
    if ($constructor) Object.assign(object, props)
    if ($type) setType(object, $type)

    if (css) env.setCss(object, css)
    if (className) env.setClass(object, className)

    // add children
    for (let child of Array.isArray(children) ? children : [children]) {
        if (child === true) {
            console.warn(Error("Trying to add boolean value of `true` as a child."))
            continue
        }

        if (Array.isArray(child)) {
            for (const ch of child) {
                append(object, ch)
            }
        } else if (child) {
            if (!(child instanceof GObject.Object)) {
                child = env.textNode(child)
            }
            append(object, child)
        }
    }

    // handle signals
    const disposeHandlers = signals.map(([sig, handler]) => {
        const id = object.connect(signalName(sig), handler)
        return () => object.disconnect(id)
    })

    // deferred props
    for (const [key, value] of Object.entries(deferredProps)) {
        if (value instanceof Accessor) {
            bindings.push([key, value])
        } else {
            Object.assign(object, { [key]: value })
        }
    }

    // handle bindings
    const disposeBindings = bindings.map(([prop, binding]) => {
        const dispose = binding.subscribe(() => {
            set(object, prop, binding.get())
        })
        set(object, prop, binding.get())
        return dispose
    })

    // cleanup
    if (disposeBindings.length > 0 || disposeHandlers.length > 0) {
        onCleanup(() => {
            disposeHandlers.forEach((cb) => cb())
            disposeBindings.forEach((cb) => cb())
        })
    }

    $?.(object)
    return object
}

// TODO: make use of jsxs
export const jsxs = jsx

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType = keyof IntrinsicElements | FC | CC
        type Element = GObject.Object
        type ElementClass = GObject.Object

        type LibraryManagedAttributes<C, Props> = JsxProps<C, Props> & {
            // FIXME: why does an intrinsic element always resolve as FC?
            // __type?: C extends CC ? "CC" : C extends FC ? "FC" : never
        }

        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface IntrinsicElements {
            // cc: CCProps<Gtk.Box, Gtk.Box.ConstructorProps, Gtk.Box.SignalSignatures>
            // fc: FCProps<Gtk.Widget, FnProps>
        }

        interface ElementChildrenAttribute {
            // eslint-disable-next-line @typescript-eslint/no-empty-object-type
            children: {}
        }
    }
}
