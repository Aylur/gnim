import GObject from "gi://GObject"
import Fragment from "./Fragment.js"
import { Binding, sync } from "../state.js"

type GObj = GObject.Object
type CC<T extends GObj = GObj> = { new (props: any): T }
type FC<T extends GObj = GObj> = (props: any) => T
type Node = GObj | number | string | boolean | null | undefined

export { Fragment }
export { default as For } from "./For.js"
export { default as With } from "./With.js"
export { default as This } from "./This.js"

type CssSetter = (object: GObj, css: string | Binding<string>) => void
type InitProps = (props: any) => void
type ChildFn = (parent: GObj, child: GObj | number | string, index?: number) => void

export let addChild: ChildFn
export let intrinsicElements: Record<string, CC | FC>

let setCss: CssSetter
let setClass: CssSetter
let initProps: InitProps

export function configue(conf: {
    addChild: ChildFn
    intrinsicElements: Record<string, CC | FC>
    setCss: CssSetter
    setClass: CssSetter
    initProps?: InitProps
}) {
    intrinsicElements = conf.intrinsicElements
    addChild = conf.addChild
    setCss = conf.setCss
    setClass = conf.setClass
    initProps = conf.initProps ?? ((props) => props)
    return conf
}

/**
 * Function Component Properties
 */
export type FCProps<Self, Props> = Partial<Props> & {
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
    class?: string | Binding<string>
    /**
     * inline CSS
     */
    css?: string | Binding<string>
} & {
    [Key in `$${string}`]: (self: Self, ...args: any[]) => any
} & {
    [K in keyof Props]?: Binding<NonNullable<Props[K]>> | Props[K]
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

export const gtkType = Symbol("gtk builder type")

function isGObjectCtor<T extends GObj>(ctor: any): ctor is CC<T> {
    return ctor.prototype instanceof GObject.Object
}

function isFunctionCtor<T extends GObj>(ctor: any): ctor is FC<T> {
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

function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

export function jsx<T extends (props: any) => GObj>(
    ctor: T,
    props: JsxProps<T, Parameters<T>[0]>,
): ReturnType<T>

export function jsx<T extends new (props: any) => GObj>(
    ctor: T,
    props: JsxProps<T, ConstructorParameters<T>[0]>,
): InstanceType<T>

export function jsx<T extends GObj>(
    ctor: keyof typeof intrinsicElements | (new (props: any) => T) | ((props: any) => T),
    { $, _, _type, _constructor, children = [], ...props }: CCProps<T, any>,
): T {
    initProps(props)

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

    // collect css and className
    const { css, class: className } = props
    delete props.css
    delete props.class

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

    if (css) setCss(object, css)
    if (className) setClass(object, className)

    if (typeof addChild === "function" && isGObjectCtor(ctor)) {
        for (const child of Array.isArray(children) ? children : [children]) {
            if (child === true) {
                console.warn("Trying to add boolean value of `true` as a child.")
                continue
            }
            if (child) addChild(object, child, -1)
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
        sync(object, prop as any, binding)
    }

    return setup(object, $, _)
}

export const jsxs = jsx

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType = keyof IntrinsicElements | FC | CC
        type Element = GObj
        type ElementClass = GObj

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
