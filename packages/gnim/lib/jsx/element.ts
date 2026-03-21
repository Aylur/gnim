import GObject from "gi://GObject?version=2.0"
import {
    connect,
    disconnect,
    isGObjectCtor,
    kebabcase,
    type CamelCase,
    type Keyof,
    type PascalCase,
} from "../util.js"
import {
    computed,
    effect,
    getScope,
    isAccessor,
    onCleanup,
    Scope,
    createState,
    untrack,
    type Accessor,
    type State,
} from "./reactive.js"
import { getRenderer } from "./render.js"

/**
 * Function Component
 */
export type FC<P = any> = (props: P) => GnimNode

/**
 * Class Component
 */
export type CC<P = any> = new (props: P) => GObject.Object

interface ConstructorNode<P = any> {
    type: string | FC<P> | CC<P>
    props: Record<string, unknown>
}

/**
 * Represents all of the things Gnim can render.
 */
export type GnimNode =
    | ConstructorNode
    | GObject.Object
    | Iterable<GnimNode>
    | Accessor<GnimNode>
    | string
    | number
    | bigint
    | boolean
    | null
    | undefined

/**
 * Lets you group elements without a wrapper node.
 *
 * @example
 *
 * ```tsx
 * import { Fragment } from "gnim"
 *
 * <Fragment>
 *   <Button>Hello</Button>
 *   <Button>World</Button>
 * </Fragment>
 * ```
 *
 * @example
 *
 * ```tsx
 * // Using the <></> shorthand syntax:
 *
 * <>
 *   <Button>Hello</Button>
 *   <Button>World</Button>
 * </>
 * ```
 */
export function Fragment({ children }: { children: GnimNode }): GnimNode[] {
    return Array.isArray(children) ? children : [children]
}

/**
 * Create a Gnim element. Do *not* use this function directly. Use JSX and a transpiler instead.
 */
export function jsx(
    type: string | FC<any> | CC<any>,
    props: Record<string, unknown>,
    key?: string | number,
): JSX.Element {
    if (type === Fragment) return Fragment(props as { children: GnimNode })
    return { type, props: key !== undefined ? { key, ...props } : props }
}

// onNotifyPropName -> notify::prop-name
// onPascalName:detailName -> pascal-name::detail-name
function signalName(key: string): string {
    const [sig, detail] = kebabcase(key.slice(2)).split(":")

    if (sig.startsWith("notify-")) {
        return `notify::${sig.slice(7)}`
    }

    return detail ? `${sig}::${detail}` : sig
}

export function newObject<C extends GObject.ObjectClass>(
    Class: C,
    args: Partial<CCProps<InstanceType<C>>>,
) {
    const { children, ref, construct, ...rest } = args as Partial<CCProps<GObject.Object>>
    const props = rest as Record<string, unknown>
    const renderer = getRenderer()

    const signals: Array<[string, (...props: unknown[]) => unknown]> = []
    const bindings: Array<[string, Accessor<unknown>]> = []

    // collect signals and bindings
    for (const [key, value] of Object.entries(props)) {
        if (key.startsWith("on")) {
            signals.push([key, value as () => unknown])
            delete props[key]
        }
        if (isAccessor(value)) {
            bindings.push([key, value])
            delete props[key]
        }
    }

    const obj =
        construct instanceof GObject.Object
            ? construct
            : typeof construct === "function"
              ? construct()
              : new Class(props)

    ref?.(obj)

    if (construct instanceof GObject.Object || typeof construct === "function") {
        for (const [key, value] of Object.entries(props)) {
            renderer.setProperty(obj, key, value)
        }
    }

    mountChildren(children, obj)

    // handle signals
    const disposeHandlers = signals.map(([sig, handler]) => {
        const id = connect(obj, signalName(sig), handler)
        return () => disconnect(obj, id)
    })

    // handle bindings
    const disposeBindings = bindings.map(([prop, { peek, subscribe }]) => {
        const dispose = subscribe(() => {
            renderer.setProperty(obj, prop, peek())
        })
        renderer.setProperty(obj, prop, peek())
        return dispose
    })

    // cleanup
    if (disposeBindings.length > 0 || disposeHandlers.length > 0) {
        onCleanup(() => {
            disposeHandlers.forEach((cb) => cb())
            disposeBindings.forEach((cb) => cb())
        })
    }

    return obj
}

function unpackSlot(node: GObject.Object | Accessor<GnimNode>): GObject.Object[] {
    if (node instanceof GObject.Object) return [node]
    return resolveNode(node()).map(unpackSlot).flat()
}

export function mountChildren(children: GnimNode, mount?: GObject.Object) {
    const renderer = getRenderer()
    const nodes = resolveNode(children)

    if (!nodes.some((node) => isAccessor(node)) && mount) {
        for (const child of nodes as Array<GObject.Object>) {
            renderer.appendChild(mount, child)
        }
        onCleanup(() => {
            for (const child of nodes as Array<GObject.Object>) {
                renderer.removeChild(mount, child)
            }
            for (const child of nodes as Array<GObject.Object>) {
                renderer.destroyChild(mount, child)
            }
        })
        return
    }

    let currentChildren: GObject.Object[] = []

    effect(
        function mountEffect() {
            const children = nodes.map(unpackSlot).flat()

            if (mount) {
                for (const child of currentChildren) {
                    renderer.removeChild(mount, child)
                }
                for (const child of currentChildren.filter((child) => !children.includes(child))) {
                    renderer.destroyChild(mount, child)
                }
                for (const child of children) {
                    renderer.appendChild(mount, child)
                }
            }

            currentChildren = children
        },
        { immediate: true },
    )

    if (mount) {
        onCleanup(() => {
            for (const child of currentChildren) {
                renderer.removeChild(mount, child)
            }
            for (const child of currentChildren) {
                renderer.destroyChild(mount, child)
            }
        })
    }
}

export function resolveNode(node: GnimNode): Array<GObject.Object | Accessor<GnimNode>> {
    const renderer = getRenderer()

    if (node === undefined || node === null || node === false || node === "") {
        return []
    }

    if (node === true) {
        console.warn("trying to render a true literal")
        return []
    }

    if (typeof node === "string") {
        return [renderer.createText(node)]
    }

    if (typeof node === "number" || typeof node === "bigint") {
        return [renderer.createText(node.toString())]
    }

    if (node instanceof GObject.Object) {
        return [node]
    }

    if (isAccessor(node)) {
        return [node]
    }

    if (Symbol.iterator in node) {
        const results = new Array<GObject.Object | Accessor<GnimNode>>()
        for (const child of node) {
            results.push(...resolveNode(child))
        }
        return results
    }

    const type = typeof node.type === "string" ? renderer.resolveTag(node.type) : node.type

    if (isGObjectCtor(type)) {
        return resolveNode(renderer.constructObject(type, node.props))
    } else {
        return resolveNode(untrack(() => type(node.props)))
    }
}

export type ForProps<Item, Key = Item> = {
    each: Accessor<Iterable<Item>>
    children: (item: Item, index: Accessor<number>) => GnimNode

    /**
     * Function that generates the key for each item.
     * By default the items are the keys themselves.
     */
    id?(item: Item): Key | Item
}

/**
 * Maps over an iterable memoizing the results.
 *
 * @example
 *
 * ```tsx
 * <For each={items}>
 *     {(item, index) => <Label label={index(i => `${item} at ${i}`)} />}
 * </For>
 * ```
 */
// TODO: support Gio.ListModel
export function For<Item, Key = Item>(props: ForProps<Item, Key>): GnimNode {
    const { each, children: mkChild, id = (item: Item) => item } = props

    type Child = ReturnType<typeof resolveNode>
    type MapItem = { item: Item; child: Child; index: State<number>; scope: Scope }

    const currentScope = getScope()
    const map = new Map<Item | Key, MapItem>()

    onCleanup(() => {
        for (const value of map.values()) {
            value.scope.dispose()
        }

        map.clear()
    })

    return computed(() => {
        const items = [...each()]
        const ids = items.map(id)
        const idSet = new Set(ids)

        for (const [key, value] of map.entries()) {
            if (!idSet.has(key)) {
                value.scope.dispose()
                map.delete(key)
            }
        }

        items.map((item, i) => {
            const key = ids[i]
            if (map.has(key)) {
                map.get(key)!.index[1](i)
            } else {
                const [index, setIndex] = createState(i)
                const scope = new Scope(currentScope)
                const child = scope.run(() => resolveNode(mkChild(item, index)))
                map.set(key, { item, child, index: [index, setIndex], scope })
            }
        })

        return [...map.values()].map((i) => i.child).flat()
    })
}

export type WithProps<T> = {
    value: Accessor<T>
    children: (value: T) => GnimNode
}

/**
 * Unwraps an Accessor and memoizes the result
 *
 * @example
 *
 * ```tsx
 * let value: Accessor<string>
 *
 * <With value={value}>
 *     {(value: string) => <Label label={value} />}
 * </With>
 * ```
 */
export function With<T>(props: WithProps<T>): GnimNode {
    const { value, children: mkChild } = props
    return computed(() => resolveNode(mkChild(value())))
}

export type PortalProps = {
    mount?: GObject.Object
    children: GnimNode
}

/**
 * Renders children into a different mount point in the widget tree,
 * breaking out of the normal parent-child hierarchy.
 *
 * @example
 *
 * ```tsx
 * <Portal mount={app}>
 *   <Gtk.Window />
 * </Portal>
 * ```
 */
export function Portal({ children, mount }: PortalProps): GnimNode {
    mountChildren(children, mount)
    return null
}

type OptionalKeys<T> = {
    /* eslint-disable @typescript-eslint/no-empty-object-type */
    [K in keyof T]-?: {} extends Pick<T, K> ? K : never
}[keyof T]

type RequiredKeys<T> = Exclude<keyof T, OptionalKeys<T>>

// prettier-ignore
type MergeProps<A, B> =
    & { [K in Extract<RequiredKeys<A>, keyof B>]: A[K] }
    & { [K in Extract<OptionalKeys<A>, keyof B>]?: A[K] | B[K] }
    & Pick<A, Exclude<keyof A, keyof B>>
    & Pick<B, Exclude<keyof B, keyof A>>

type GObjectProps<T> = T extends {
    $signals: unknown
    $readableProperties: unknown
    $writableProperties: unknown
}
    ? {
          children: GnimNode
          ref(self: T): void
      } & {
          // writable reactive properties
          [K in Keyof<T["$writableProperties"]> as CamelCase<K>]: Accessor<
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
    : never

type CCProps<T, Props = Partial<GObject.ConstructorProps<T>>> =
    | (MergeProps<Props, Partial<GObjectProps<T>>> & { construct?: never })
    | (Partial<GObjectProps<T>> & { construct: T | (() => T) })

export namespace JSX {
    export type ElementType = keyof IntrinsicElements | typeof Fragment | FC | CC
    export type Element = ConstructorNode | Iterable<GnimNode>
    export type ElementClass = GObject.Object

    /* eslint-disable @typescript-eslint/no-empty-object-type */
    export interface IntrinsicElements {
        // empty, defined by users and libs
    }

    /* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-object-type */
    export interface IntrinsicClassAttributes<T> {
        // empty, defined by renderers
    }

    export type LibraryManagedAttributes<C, Props> = C extends FC
        ? Props
        : C extends CC
          ? CCProps<InstanceType<C>, Omit<NonNullable<Props>, keyof IntrinsicClassAttributes<C>>>
          : never
}
