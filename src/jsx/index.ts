import GObject from "gi://GObject"
import Fragment from "./Fragment.js"
import { Accessor, sync } from "../state.js"
import { CC, FC, env } from "./env.js"
import { kebabify } from "../util.js"

type Node = GObject.Object | number | string | boolean | null | undefined

export { Fragment }
export { default as For } from "./For.js"
export { default as With } from "./With.js"
export { default as This } from "./This.js"
export { createContext } from "./context.js"

const gtkType = Symbol("gtk builder type")

/**
 * Get the type of the object specified through the `_type` property
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
    _type?: string
    /**
     * setup function
     * its consumed internally and not actually passed as a parameters
     */
    $?(self: Self): void
}

/**
 * Class Component Properties
 */
export type CCProps<Self, Props> = {
    /**
     * @internal children elements
     * its consumed internally and not actually passed to class component constructors
     */
    children?: Array<Node> | Node
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed to class component constructors
     */
    _type?: string
    /**
     * function to use as a constructor,
     * its consumed internally and not actually passed to class component constructors
     */
    _constructor?(props: Partial<Props>): Self
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
    [Key in `$${string}`]: (self: Self, ...args: any[]) => any
} & {
    [K in keyof Props]?: Accessor<NonNullable<Props[K]>> | Props[K]
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

function isGObjectCtor<T extends GObject.Object>(ctor: any): ctor is CC<T> {
    return ctor.prototype instanceof GObject.Object
}

function isFunctionCtor<T extends GObject.Object>(ctor: any): ctor is FC<T> {
    return typeof ctor === "function" && !isGObjectCtor(ctor)
}

function setType(object: object, type: string) {
    if (gtkType in object && object[gtkType] !== "") {
        console.warn(`type overriden from ${object[gtkType]} to ${type} on ${object}`)
    }

    Object.assign(object, { [gtkType]: type })
}

function setup<T>(object: T, ...setups: unknown[]): T {
    for (const setup of setups) {
        if (typeof setup === "function") {
            setup(object)
        }
    }
    return object
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
    { $, _, _type, _constructor, children = [], ...props }: CCProps<T, any>,
): T {
    env.initProps(props)

    for (const [key, value] of Object.entries(props)) {
        if (value === undefined) delete props[key]
    }

    if (typeof ctor === "string" && ctor in env.intrinsicElements) {
        ctor = env.intrinsicElements[ctor] as FC<T> | CC<T>
    }

    if (isFunctionCtor(ctor)) {
        const object = ctor({ children, ...props })
        if (_type) setType(object, _type)
        return setup(object, $, _, env.initObject)
    }

    // collect css and className
    const { css, class: className } = props
    delete props.css
    delete props.class

    const signals: Array<[string, (...props: unknown[]) => unknown]> = []
    const bindings: Array<[string, Accessor<unknown>]> = []

    // collect signals and bindings
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("$")) {
            signals.push([key.slice(1), value as () => unknown])
            delete props[key]
        }
        if (value instanceof Accessor) {
            bindings.push([key, value])
            props[key] = value.get()
        }
    }

    // construct
    const object = _constructor ? _constructor(props) : new (ctor as CC<T>)(props)
    if (_constructor) Object.assign(object, props)
    if (_type) setType(object, _type)

    if (css) env.setCss(object, css)
    if (className) env.setClass(object, className)

    if (typeof env.addChild === "function" && isGObjectCtor(ctor)) {
        for (const child of Array.isArray(children) ? children : [children]) {
            if (child === true) {
                console.warn("Trying to add boolean value of `true` as a child.")
                continue
            }
            if (child) env.addChild(object, child, -1)
        }
    }

    // handle signals
    for (const [sig, handler] of signals) {
        if (sig.startsWith("$")) {
            object.connect(`notify::${kebabify(sig.slice(1))}`, handler)
        } else {
            object.connect(kebabify(sig), handler)
        }
    }

    // handle bindings
    for (const [prop, binding] of bindings) {
        sync(object, prop as Extract<keyof T, string>, binding as Accessor<T[keyof T]>)
    }

    return setup(object, $, _, env.initObject)
}

export const jsxs = jsx

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType = keyof IntrinsicElements | FC | CC
        type Element = GObject.Object
        type ElementClass = GObject.Object

        type LibraryManagedAttributes<C, Props> = JsxProps<C, Props> & {
            /* reserved prop name by the jsx transform, which is not used by gjsx */
            key?: never
            // FIXME: why does an intrinsic element always resolve as FC?
            // __type?: C extends CC ? "CC" : C extends FC ? "FC" : never
        }

        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface IntrinsicElements {
            // cc: CCProps<Gtk.Box, Gtk.Box.ConstructorProps>
            // fc: FCProps<Gtk.Widget, FnProps>
        }

        interface ElementChildrenAttribute {
            // eslint-disable-next-line @typescript-eslint/no-empty-object-type
            children: {}
        }
    }
}
