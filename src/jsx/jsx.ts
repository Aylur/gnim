import GObject from "gi://GObject"
import { Fragment } from "./Fragment.js"
import { Accessor } from "./state.js"
import { CC, FC, env } from "./env.js"
import { kebabify, Pascalify, set } from "../util.js"
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
    const { $, $type, $constructor, children = [], ...rest } = inprops as CCProps<T, any>
    const props = rest as Record<string, any>

    if (key) Object.assign(props, { key })
    env.initProps(props)

    for (const [key, value] of Object.entries(props)) {
        if (value === undefined) delete props[key]
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
            signals.push([key.slice(2), value as () => unknown])
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
    for (const child of Array.isArray(children) ? children : [children]) {
        if (child === true) {
            console.warn("Trying to add boolean value of `true` as a child.")
            continue
        }

        if (Array.isArray(child)) {
            for (const ch of child) {
                env.addChild(object, ch, -1)
            }
        } else if (child) {
            env.addChild(object, child, -1)
        }
    }

    // handle signals
    const disposeHandlers = signals.map(([sig, handler]) => {
        const name = kebabify(sig)
        const id = name.startsWith("notify-")
            ? object.connect(`notify::${name.slice(7)}`, handler)
            : object.connect(kebabify(sig), handler)

        return () => object.disconnect(id)
    })

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
