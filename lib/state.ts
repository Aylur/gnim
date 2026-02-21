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
export interface Accessor<T> {
    /**
     * Shorthand for `createComputed(() => compute(accessor()))`.
     * @see createComputed
     * @returns A new {@link Accessor} for the computed value.
     */
    <R = T>(compute: (value: T) => R): Accessor<R>

    /**
     * Create a new {@link Accessor} that applies a transformation on its value when read.
     * This operation is also known as `map` in other languages.
     * @param transform The transformation to apply. Should be a pure function.
     */
    as<R = T>(transform: (value: T) => R): Accessor<R>

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
     * You might want to consider using {@link createEffect} instead.
     * @param callback The function to run when the value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: Callback): DisposeFn
}

export class Accessor<T = unknown> extends Function {
    #get: () => T
    #subscribe: (callback: Callback) => DisposeFn

    constructor(get: () => T, subscribe?: (callback: Callback) => DisposeFn) {
        super("return arguments.callee._call.apply(arguments.callee, arguments)")
        this.#subscribe = subscribe ?? (() => () => {})
        this.#get = get
    }

    subscribe(callback: Callback): DisposeFn {
        return this.#subscribe(callback)
    }

    peek(): T {
        return this.#get()
    }

    as<R = T>(transform: (value: T) => R): Accessor<R> {
        return new Accessor(() => transform(this.#get()), this.#subscribe)
    }

    protected _call<R = T>(compute: (value: T) => R): Accessor<R>
    protected _call(): T

    protected _call<R = T>(compute?: (value: T) => R): Accessor<R> | T {
        if (typeof compute === "function") {
            return createComputed(() => compute(this()))
        }

        accessStack.at(-1)?.add(this)
        return this.peek()
    }

    toString(): string {
        return `Accessor { ${this.peek()} }`
    }

    [Symbol.toPrimitive]() {
        console.warn("Accessor implicitly converted to a primitive value.")
        return this.toString()
    }
}

export type Setter<T> = {
    (value: T): void
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
export function createState<T>(init: T, options?: StateOptions<T>): State<T> {
    let currentValue = init
    const observers = new Set<Callback>()
    const equals = options?.equals ?? Object.is

    function subscribe(callback: Callback): DisposeFn {
        observers.add(callback)
        return () => observers.delete(callback)
    }

    function set(newValue: unknown): void {
        const value: T =
            newValue instanceof Accessor
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

    return [new Accessor(get, subscribe), set]
}

let effectDepth = 0

function push<T>(fn: () => T) {
    const deps = new Set<Accessor>()
    accessStack.push(deps)
    const res = fn()
    accessStack.pop()
    return [res, deps] as const
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

/**
 * Create a computed value which tracks dependencies and invalidates the value
 * whenever they change. The result is cached and is only computed on access.
 *
 * @param fn The computation logic.
 * @returns An {@link Accessor} to the value.
 *
 * @example
 *
 * ```ts
 * let a: Accessor<number>
 * let b: Accessor<number>
 * const c: Accessor<number> = createComputed(() => a() + b())
 * ```
 */
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
        if (!state.dirty) return state.value

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

    return new Accessor(get, subscribe)
}

interface MemoOptions<T> {
    /**
     * Can be used to customize the equality check used to determine whether value has changed.
     * @default Object.is
     */
    equals?: (prev: T, next: T) => boolean
}

/**
 * Create a derived reactive value which tracks its dependencies and reruns the computation
 * whenever a dependency changes. The resulting {@link Accessor} will only notify observers
 * when the computed value has changed.
 */
export function createMemo<T>(fn: (prev?: T) => T, opts?: MemoOptions<T>): Accessor<T> {
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

    return new Accessor(get, subscribe)
}

type EffectOptions<T> = {
    /**
     * Run the effect immediately instead of after the {@link Scope} returns
     */
    immediate?: boolean
}

/**
 * Schedule a function which tracks reactive values accessed within
 * and re-runs whenever they change.
 */
export function createEffect<T = void>(fn: (prev?: T) => T, opts?: EffectOptions<T>) {
    const parentScope = Scope.current

    let currentValue: T
    let currentDeps = new Map<Accessor, DisposeFn>()
    let currentScope = new Scope(parentScope)

    function effect() {
        effectDepth++
        currentScope.dispose()
        currentScope = new Scope(parentScope)

        const [value, deps] = currentScope.run(() => push(() => fn(currentValue)))

        currentDeps = diff(currentDeps, deps, effect)
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
        return effect()
    }

    parentScope.onCleanup(dispose)
    if (opts?.immediate) {
        effect()
    } else {
        parentScope.onMount(effect)
    }
}

/**
 * Create a reactive value from a provier function.
 * The provider is called when the first subscriber appears and the returned dispose
 * function from the provider will be called when the number of subscribers drop to zero.
 *
 * @param init The initial value
 * @param producer The producer function which should return a cleanup function
 *
 * @example
 *
 * ```ts
 * const value = createExternal(0, (set) => {
 *   const interval = setInterval(() => set((v) => v + 1))
 *   return () => clearInterval(interval)
 * })
 * ```
 */
export function createExternal<T>(init: T, producer: (set: Setter<T>) => DisposeFn): Accessor<T> {
    let currentValue = init
    let dispose: DisposeFn
    const subscribers = new Set<Callback>()

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            dispose = producer((v: unknown) => {
                const newValue: T = typeof v === "function" ? v(currentValue) : v
                if (!Object.is(newValue, currentValue)) {
                    currentValue = newValue
                    Array.from(subscribers).forEach((cb) => cb())
                }
            })
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                dispose()
            }
        }
    }

    return new Accessor(() => currentValue, subscribe)
}
