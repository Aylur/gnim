import type { GnimNode } from "./element.js"
import { getScope, onCleanup, Scope } from "./scope.js"
import { type Accessor, isAccessor, effect, computed, state, type State } from "./state.js"
import { resolveNode, unpackSlot } from "./element.js"
import GObject from "gi://GObject?version=2.0"
import { getRenderer } from "./render.js"

// TODO: support Gio.ListModel

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
                const [index, setIndex] = state(i)
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
    return computed(() => mkChild(value()))
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
    const renderer = getRenderer()
    const nodes = resolveNode(children)

    if (!nodes.some((node) => isAccessor(node)) && mount) {
        for (const child of nodes as Array<GObject.Object>) {
            renderer.appendChild(mount, child)
        }
        return
    }

    effect(
        function mountPortalEffect() {
            const children = nodes.map(unpackSlot).flat()
            if (mount) {
                for (const child of children) {
                    renderer.appendChild(mount, child)
                }
                onCleanup(() => {
                    for (const child of children) {
                        renderer.removeChild(mount, child)
                    }
                })
            }
        },
        { immediate: true },
    )

    return []
}
