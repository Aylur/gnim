import GObject from "../gobject.js"
import Fragment from "./Fragment.js"
import { Binding, sync } from "../state.js"

export { Fragment }
export { default as For } from "./For.js"
export { default as When } from "./When.js"
export { default as This } from "./This.js"

type ChildFn = (parent: GObject.Object, child: GObject.Object, index?: number) => void

export let addChild: ChildFn
export let intrinsicElements: Record<string, CC | FC>

export function configue(conf: { addChild: ChildFn, intrinsicElements: Record<string, CC | FC> }) {
    addChild = conf.addChild
    intrinsicElements = conf.intrinsicElements
    return conf
}

type Setup<T> = {
    $?(self: T): void
    _type?: string
}

type SignalHandlers<T> = {
    [Key in `$${string}`]: (self: T, ...args: any[]) => any
}

type BindableProps<T> = {
    [K in keyof T]: Binding<T[K]> | T[K];
}

type Element = GObject.Object | "" | false | null | undefined

type Children = {
    children?: Array<Element> | Element
}

export type CtorProps<Self, Props extends GObject.Object.ConstructorProps> = Partial<
    SignalHandlers<Self> & BindableProps<Props> & Setup<Self> & {
        _constructor?(): Self
    }
>

type CC<T extends GObject.Object = GObject.Object> = { new(props: any): T }
type FC<T extends GObject.Object = GObject.Object> = (props: any) => T

type JsxProps<Self, Props extends GObject.Object.ConstructorProps> =
    Self extends typeof Fragment ? (Props & Setup<InstanceType<Self>>)
        : Self extends FC ? (Props & Setup<ReturnType<Self>>)
            : Self extends CC ? CtorProps<InstanceType<Self>, Props> & Children : never

export const gtkType = Symbol("gtk builder type")

function isGObjectCtor<T extends GObject.Object>(ctor: any): ctor is CC<T> {
    return ctor.prototype instanceof GObject.Object
}

function isFunctionCtor<T extends GObject.Object>(ctor: any): ctor is FC<T> {
    return typeof ctor === "function" && !isGObjectCtor(ctor)
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
    { $, _type, _constructor, children = [], ...props }: CtorProps<T, any>,
): T {
    for (const [key, value] of Object.entries(props)) {
        if (value === undefined) delete props[key]
    }

    if (typeof ctor === "string" && ctor in intrinsicElements) {
        ctor = intrinsicElements[ctor] as FC<T> | CC<T>
    }

    if (isFunctionCtor(ctor)) {
        const object = ctor({ children, ...props })
        if (_type) Object.assign(object, { [gtkType]: _type })
        $?.(object)
        return object
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
    const object = _constructor ? _constructor() : new (ctor as CC<T>)(props)
    if (_constructor) Object.assign(object, props)
    if (_type) Object.assign(object, { [gtkType]: _type })

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

    // return
    $?.(object)
    return object
}

export const jsxs = jsx

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        type ElementType = CC | FC | keyof IntrinsicElements
        type Element = GObject.Object
        type ElementClass = GObject.Object
        type LibraryManagedAttributes<Self, Props extends GObject.Object.ConstructorProps> = JsxProps<Self, Props>

        // eslint-disable-next-line @typescript-eslint/no-empty-object-type
        interface IntrinsicElements {
            // cc: CtorProps<Gtk.Box, Gtk.Box.ConstructorProps>
            // fc: FcProp
        }

        interface ElementChildrenAttribute {
            // eslint-disable-next-line @typescript-eslint/no-empty-object-type
            children: {}
        }
    }
}
