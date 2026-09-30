import { jsx, resolveNode, type FC } from "./element.js"
import { computed, devHooks } from "./reactive.js"
import { getContext, setContext, Signal, untrack, type Context } from "./signal.js"

type StateRecord<T = unknown> = { init: T; current(): T }

class StateCtx {
    private rendering = false
    private dirty = false
    private current: null | Array<StateRecord> = null
    private buffer = new Array<StateRecord>()
    private children = new Map<string, StateCtx[]>()
    private nextChildren = new Map<string, StateCtx[]>()

    push<T>(init: T, get: () => T): T {
        // States created after the render, e.g. in effects or in children that
        // are created later, have no stable position in the list.
        if (!this.rendering || this.dirty) return init

        if (!this.current) {
            this.buffer.push({ init, current: get })
            return init
        }

        const state = this.current.shift()

        if (state && state.init === init) {
            this.buffer.push({ init, current: get })
            return state.current() as T
        }

        this.dirty = true
        return init
    }

    get(id: string): StateCtx {
        if (!this.rendering) return new StateCtx()

        let next = this.nextChildren.get(id)
        if (!next) this.nextChildren.set(id, (next = []))

        const ctx = this.children.get(id)?.[next.length] ?? new StateCtx()
        next.push(ctx)
        return ctx
    }

    begin() {
        this.rendering = true
    }

    flush() {
        this.rendering = false
        this.current = this.dirty ? null : this.buffer
        this.buffer = []
        this.dirty = false
        this.children = this.nextChildren
        this.nextChildren = new Map()
    }
}

const stateCtx: Context<StateCtx | null> = { defaultValue: null }

function getStateCtx(): StateCtx | null {
    try {
        return getContext(stateCtx)
    } catch {
        return null
    }
}

function isContext(instance: unknown): instance is Context<any> {
    return (
        typeof instance === "function" &&
        "defaultValue" in instance &&
        "use" in instance &&
        typeof instance.use === "function" &&
        "provide" in instance &&
        typeof instance.provide === "function"
    )
}

/**
 * Create a registry of hot reloadable components and hook it into `createState`.
 */
export function createComponentRegistry() {
    const registry = new Map<string, Signal<FC>>()

    devHooks.createState = function (init, get) {
        const ctx = getStateCtx()
        return ctx ? ctx.push(init, get) : init
    }

    return function registerComponent(id: string, impl: FC) {
        if (typeof impl !== "function") return impl

        let entry = registry.get(id)

        if (!entry) {
            entry = new Signal(impl)
            registry.set(id, entry)
        }

        const prevImpl = untrack(() => entry.get())

        if (isContext(impl) && isContext(prevImpl)) {
            const prevDefaultValue = prevImpl.defaultValue
            const nextDefaultValue = impl.defaultValue
            if (!Object.is(prevDefaultValue, nextDefaultValue)) {
                entry.set(impl)
            }
            return untrack(() => entry.get())
        }

        entry.set(impl)

        return function (props: any) {
            const state = getStateCtx()?.get(id) ?? new StateCtx()

            const node = computed(() => {
                setContext(stateCtx, state)
                state.begin()
                try {
                    return resolveNode(jsx(entry.get(), props))
                } finally {
                    state.flush()
                }
            })

            // `Computed` is lazy: resolving eagerly to mimic prod builds
            untrack(node)
            return node
        }
    }
}
