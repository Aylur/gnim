import GObject from "../gobject.js"
import Fragment from "./Fragment.js"
import { Binding, sync } from "../state.js"

type CC<T extends GObject.Object = GObject.Object> = { new(props: any): T }
type FC<T extends GObject.Object = GObject.Object> = (props: any) => T

export { Fragment }
export { default as For } from "./For.js"
export { default as With } from "./With.js"
export { default as This } from "./This.js"

type ChildFn = (parent: GObject.Object, child: GObject.Object, index?: number) => void

export let addChild: ChildFn
export let intrinsicElements: Record<string, CC | FC>

export function configue(conf: {
    addChild: ChildFn,
    intrinsicElements: Record<string, CC | FC>,
}) {
    addChild = conf.addChild
    intrinsicElements = conf.intrinsicElements
    return conf
}

type Element = GObject.Object | "" | false | null | undefined

/**
 * Function Component Properties
 */
export type FCProps<Self, Props> = Props & Partial<{
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed as a parameters
     */
    _type: string
    /**
     * setup function
     * its consumed internally and not actually passed as a parameters
     */
    $(self: Self): void
}>

/**
 * Class Component Properties
 */
export type CCProps<Self, Props> = Partial<{
    /**
     * @internal children elements
     * its consumed internally and not actually passed to class component constructors
     */
    children: Array<Element> | Element
    /**
     * Gtk.Builder type
     * its consumed internally and not actually passed to class component constructors
     */
    _type: string
    /**
     * function to use as a constructor,
     * its consumed internally and not actually passed to class component constructors
     */
    _constructor(props: Partial<Props>): Self
    /**
     * setup function,
     * its consumed internally and not actually passed to class component constructors
     */
    $(self: Self): void
} & {
    [Key in `$${string}`]: (self: Self, ...args: any[]) => any
} & {
    [K in keyof Props]: Binding<Props[K]> | Props[K]
}>

type JsxProps<C, Props> =
    C extends typeof Fragment ? (Props & {})
    // FIXME: IntrinsicElements always resolve as FC
    // so if we use the same symbol for both CC and FC setup functions 
    // then intrinsicElement setup functions will be typed as
    // `$(self: GObject.Object | InstanceType<C>): void`
    // : C extends FC ? FCProps<ReturnType<FC>, Props>
    : C extends FC ? Props & { _type?: string }
    : C extends CC ? CCProps<InstanceType<C>, Props>
    : never

export const gtkType = Symbol("gtk builder type")

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

const kebabify = (str: string) => str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()

export function jsx<T extends ((props: any) => GObject.Object)>(
    ctor: T,
    props: JsxProps<T, Parameters<T>[0]>,
): ReturnType<T>

export function jsx<T extends (new (props: any) => GObject.Object)>(
    ctor: T,
    props: JsxProps<T, ConstructorParameters<T>[0]>,
): InstanceType<T>

export function jsx<T extends GObject.Object>(
    ctor: keyof typeof intrinsicElements | (new (props: any) => T) | ((props: any) => T),
    { $, _, _type, _constructor, children = [], ...props }: CCProps<T, any>
): T {
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined) delete props[key]
    }

    if (typeof ctor === "string" && ctor in intrinsicElements) {
        ctor = intrinsicElements[ctor] as FC<T> | CC<T>
    }

    if (isFunctionCtor(ctor)) {
        const object = ctor({ children, ...props })
        if (_type) setType(object, _type)
        return setup(object, $, _)
    }

    const signals: Array<[string, (...props: unknown[]) => unknown]> = []
    const bindings: Array<[string, Binding<unknown>]> = []

    // collect signals and bindings
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("$")) {
            signals.push([key.slice(1), value as () => unknown])
            delete props[key]
        }
        if (value instanceof Binding) {
            bindings.push([key, value])
            props[key] = value.get()
        }
    }

    // construct
    const object = _constructor ? _constructor(props) : new (ctor as CC<T>)(props)
    if (_constructor) Object.assign(object, props)
    if (_type) setType(object, _type)

    if (typeof addChild === "function" && isGObjectCtor(ctor)) {
        if (Array.isArray(children)) {
            for (const child of children) {
                if (child) addChild(object, child, -1)
            }
        } else if (children) {
            addChild(object, children, -1)
        }
    }

    // handle signals
    for (const [sig, handler] of signals) {
        if (sig.startsWith("_")) {
            object.connect(`notify::${kebabify(sig.slice(1))}`, handler)
        } else {
            object.connect(kebabify(sig), handler)
        }
    }

    // handle bindings
    for (const [prop, binding] of bindings) {
        sync(object, prop as any, binding)
    }

    $?.(object)
    return setup(object, $, _)
}

export const jsxs = jsx

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType = keyof IntrinsicElements | FC | CC
        type Element = GObject.Object
        type ElementClass = GObject.Object

        type LibraryManagedAttributes<C, Props> = JsxProps<C, Props>
        // FIXME: why does an intrinsic element always resolve as FC?
        // __type?: C extends CC ? "CC" : C extends FC ? "FC" : never

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
