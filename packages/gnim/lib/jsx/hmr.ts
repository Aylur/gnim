import { jsx, resolveNode, type FC } from "./element.js"
import { devHooks, sources } from "./dev.js"
import { computed } from "./reactive.js"
import {
    getContext,
    getScope,
    setContext,
    Signal,
    untrack,
    type Context,
    type Scope,
} from "./signal.js"

const proxies = new WeakSet<object>()
const proxySources = new WeakMap<Scope, string>()

devHooks.createElementScope = function (node, scope) {
    const source = sources.get(node)
    if (typeof node.type === "function" && proxies.has(node.type)) {
        // proxies are left out of the component stack,
        // the component they render gets the source instead
        delete scope.name
        if (source) proxySources.set(scope, source)
    } else if (source) {
        scope.source = source
    }
}

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
    return typeof instance === "function" && "defaultValue" in instance
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

        const proxy = function (props: any) {
            const state = getStateCtx()?.get(id) ?? new StateCtx()
            const scope = getScope()
            const source = scope && proxySources.get(scope)

            const node = computed(() => {
                setContext(stateCtx, state)
                state.begin()
                try {
                    const element = jsx(entry.get(), props)
                    if (source) sources.set(element, source)
                    return resolveNode(element)
                } finally {
                    state.flush()
                }
            })

            // `Computed` is lazy: resolving eagerly to mimic prod builds
            untrack(node)
            return node
        }

        proxies.add(proxy)
        return proxy
    }
}
