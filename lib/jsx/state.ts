import { Scope } from "./scope.js"

type Callback = () => void
type DisposeFn = () => void

const accessStack = new Array<Set<Accessor>>()

export type Accessed<T> = T extends Accessor<infer V> ? V : never

/**
 * Accessors are the base of Gnim's reactive system.
 * They are functions that let you read a value and track it in reactive scopes so that
 * when they change the reader is notified.
 */
export interface Accessor<T = unknown> {
    /**
     * Create a computed value which tracks `this` and invalidates the value
     * whenever it changes. The result is cached and is only computed on access.
     *
     * @returns A new {@link Accessor} for the computed value.
     */
    <R = T>(compute: (value: T) => R): Accessor<R>

    /**
     * Get the current value and track it as a dependency in reactive scopes.
     * @returns The current value.
     */
    (): T

    /**
     * Get the current value **without** tracking it as a dependency in reactive scopes.
     * @returns The current value.
     */
    peek(): T

    /**
     * Subscribe for value changes.
     * This method is **not** scope aware; you need to dispose it when it is no longer used.
     * You might want to consider using an {@link effect} instead.
     * @param callback The function to run when the value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: Callback): DisposeFn
}

export function isAccessor(instance: unknown): instance is Accessor {
    return typeof instance === "function" && "peek" in instance && "subscribe" in instance
}

export function createAccessor<T>(
    get: () => T,
    subscribe: (callback: Callback) => DisposeFn,
): Accessor<T> {
    function access<R = T>(compute?: (value: T) => R): Accessor<R> | T {
        if (typeof compute === "function") {
            return createComputed(() => {
                accessStack.at(-1)?.add(accessor)
                return compute(get())
            })
        }

        accessStack.at(-1)?.add(accessor)
        return get()
    }

    const accessor = Object.assign(access, {
        peek: get,
        subscribe: subscribe,
        toString(): string {
            return `Accessor { ${get()} }`
        },
        [Symbol.toPrimitive]() {
            console.warn("Accessor implicitly converted to a primitive value.")
            return `Accessor { ${get()} }`
        },
    }) as Accessor<T>

    return accessor
}

export type Setter<T> = {
    (value: Exclude<T, Function>): void
    (producer: (prev: T) => T): void
}

export type State<T> = [Accessor<T>, Setter<T>]

export interface StateOptions<T> {
    /**
     * Can be used to customize the equality check used to determine whether value has changed.
     * @default Object.is
     */
    equals?: (prev: T, next: T) => boolean
}

/**
 * Create a writable reactive value.
 * @param init The intial value.
 * @returns An {@link Accessor} and a setter function.
 */
export function state<T>(init: T, options?: StateOptions<NoInfer<T>>): State<T> {
    let currentValue = init
    const observers = new Set<Callback>()
    const equals = options?.equals ?? Object.is

    function subscribe(callback: Callback): DisposeFn {
        observers.add(callback)
        return () => observers.delete(callback)
    }

    function set(newValue: unknown): void {
        const value: T = isAccessor(newValue)
            ? newValue
            : typeof newValue === "function"
              ? newValue(currentValue)
              : newValue

        if (!equals(currentValue, value)) {
            currentValue = value
            Array.from(observers).forEach((cb) => cb())
        }
    }

    function get(): T {
        return currentValue
    }

    return [createAccessor(get, subscribe), set]
}

let effectDepth = 0

function push<T>(fn: () => T) {
    const deps = new Set<Accessor>()
    accessStack.push(deps)
    const res = fn()
    accessStack.pop()
    return [res, deps] as const
}

export function untrack<T>(fn: () => T) {
    return push(fn)[0]
}

function diff(prev: Map<Accessor, DisposeFn>, next: Set<Accessor>, fn: Callback) {
    const newDeps = new Map<Accessor, DisposeFn>()

    for (const [dep, dispose] of prev) {
        if (!next.has(dep)) {
            dispose()
        } else {
            newDeps.set(dep, dispose)
        }
    }

    for (const dep of next) {
        if (!newDeps.has(dep)) {
            newDeps.set(dep, dep.subscribe(fn))
        }
    }

    return newDeps
}

export function createComputed<T>(fn: (prev?: T) => T) {
    const parentScope = Scope.current

    const observers = new Set<Callback>()
    const state: { value: null; dirty: true } | { value: T; dirty: false } = {
        value: null,
        dirty: true,
    }

    let scope = new Scope(parentScope)
    let deps = new Map<Accessor, DisposeFn>()

    let preValue: T | null
    let preDeps = new Set<Accessor>()

    function invalidate() {
        scope.dispose()
        state.value = null
        state.dirty = true
        Array.from(observers).forEach((cb) => cb())
    }

    function computeEffect() {
        scope = new Scope(parentScope)

        const [value, next] = scope.run(() => push(() => (state.dirty ? fn() : fn(state.value))))

        deps = diff(deps, next, invalidate)
        state.dirty = false
        state.value = value

        return value
    }

    function subscribe(callback: Callback): DisposeFn {
        if (observers.size === 0) {
            if (effectDepth > 0) {
                state.dirty = false
                state.value = preValue
                deps = new Map([...preDeps].map((dep) => [dep, dep.subscribe(invalidate)]))
                preDeps.clear()
                preValue = null
            } else {
                computeEffect()
            }
        }

        observers.add(callback)

        return () => {
            observers.delete(callback)
            if (observers.size === 0) {
                deps.forEach((cb) => cb())
                deps.clear()
                state.dirty = true
                state.value = null
            }
        }
    }

    function get(): T {
        if (!state.dirty) {
            return state.value
        }

        if (observers.size === 0) {
            if (effectDepth > 0) {
                const [res, deps] = scope.run(() => push(fn))
                preDeps = deps
                preValue = res
                return res
            } else {
                return fn()
            }
        }

        // outside an effect doing .subscribe(() => .peek())
        // will trigger the effect here on first access
        return computeEffect()
    }

    return createAccessor(get, subscribe)
}

const noop = () => {}

/**
 * Create a derived reactive value which tracks its dependencies and reruns the computation
 * whenever a dependency changes. The resulting {@link Accessor} will only notify observers
 * when the computed value has changed.
 *
 * @example
 *
 * ```ts
 * let a: Accessor<number>
 * let b: Accessor<number>
 * const c: Accessor<number> = computed(() => a() + b())
 * ```
 */
export function computed<T>(fn: (prev?: T) => T, opts?: StateOptions<NoInfer<T>>): Accessor<T> {
    let init = false
    let currentValue: T
    let dispose: DisposeFn

    const equals = opts?.equals ?? Object.is
    const value = createComputed(fn)
    const subscribers = new Set<Callback>()

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            effectDepth += 1
            currentValue = value.peek()
            init = true
            dispose = value.subscribe(() => {
                const v = value.peek()
                if (!equals(currentValue, v)) {
                    currentValue = v
                    Array.from(subscribers).forEach((cb) => cb())
                }
            })
            effectDepth -= 1
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                dispose()
                init = false
            }
        }
    }

    function get(): T {
        if (init) return currentValue
        return value.peek()
    }

    // FIXME: this should be refactored
    if (Scope.current) {
        Scope.current.onCleanup(subscribe(noop))
    }

    return createAccessor(get, subscribe)
}

type EffectOptions = {
    /**
     * Run the effect immediately instead of after the {@link Scope} returns
     */
    immediate?: boolean
}

/**
 * Schedule a function which tracks reactive values accessed within
 * and re-runs whenever they change.
 */
export function effect<T = void>(fn: (prev?: T) => T, opts?: EffectOptions) {
    const parentScope = Scope.current

    let currentValue: T
    let currentDeps = new Map<Accessor, DisposeFn>()
    let currentScope = new Scope(parentScope)

    function syncEffect() {
        effectDepth++
        currentScope.dispose()
        currentScope = new Scope(parentScope)

        const [value, deps] = currentScope.run(() => push(() => fn(currentValue)))

        currentDeps = diff(currentDeps, deps, syncEffect)
        currentValue = value
        effectDepth--
    }

    function dispose() {
        currentDeps.forEach((cb) => cb())
        currentDeps.clear()
        currentScope.dispose()
    }

    if (!parentScope) {
        console.warn(Error("effects created outside a `createRoot` will never be disposed"))
        return syncEffect()
    }

    parentScope.onCleanup(dispose)
    if (opts?.immediate) {
        syncEffect()
    } else {
        parentScope.onMount(syncEffect)
    }
}
