import GObject from "gi://GObject?version=2.0"
import { resolveNode, type GnimNode } from "./element.js"
import { connect, disconnect, type Keyof } from "../util.js"

type Fn = () => void

interface DevHooks {
    createState<T>(init: T, get: () => T): T
}

export const devHooks: DevHooks = {
    createState: (init) => init,
}

const noop = () => {}

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
     * Create a new {@link Accessor} that applies a transformation on its value when read.
     * This operation is also known as `map` in other languages.
     * @param transform The transformation to apply. Should be a pure function.
     */
    as<R = T>(fn: (value: T) => R): Accessor<R>

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
    subscribe(callback: Fn): Fn
}

/**
 * Scopes contain context values and cleanup functions.
 */
export class Scope {
    static current: Scope | null = null

    owner: Scope | null = null
    contexts = new Map<Context<any>, unknown>()
    cleanups: Fn[] = []
    after: Fn[] | null = []

    constructor(parent?: Scope | null) {
        if (parent) this.owner = parent
    }

    run<T>(fn: () => T): T {
        const prevOwner = Scope.current
        Scope.current = this

        try {
            return fn()
        } finally {
            this.after?.forEach((cb) => cb())
            this.after = null
            Scope.current = prevOwner
        }
    }

    dispose() {
        this.cleanups.forEach((cb) => cb())
        this.cleanups.length = 0
        this.owner = null
    }
}

/**
 * Context lets components pass information deep down without explicitly
 * passing props.
 *
 * @see {createContext}
 */
export interface Context<T = unknown> {
    use(): T
    provide<R>(value: T, fn: () => R): R
    (props: { value: T; children: GnimNode }): GnimNode
}

/**
 * Lets you create a {@link Context} that components can provide or read.
 *
 * @param defaultValue The value you want the context to have when there is no
 * provider in the tree above the component reading the context. This is meant
 * as a "last resort" fallback.
 *
 * @example
 *
 * ```tsx
 * const MyContext = createContext("fallback-value")
 *
 * function ConsumerComponent() {
 *   const value = MyContext.use()
 *
 *   return <Gtk.Label label={value} />
 * }
 *
 * function ProviderComponent() {
 *   return (
 *     <Gtk.Box>
 *       <MyContext value="my-value">
 *         <ConsumerComponent />
 *       </MyContext>
 *     </Gtk.Box>
 *   )
 * }
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
    let ctx: Context<T>

    function withContext<R>(value: T, fn: () => R) {
        const parent = getScope()
        const scope = new Scope(parent)
        scope.contexts.set(ctx, value)
        return scope.run(fn)
    }

    function use(): T {
        let scope = Scope.current
        while (scope) {
            const value = scope.contexts.get(ctx)
            if (value !== undefined) return value as T
            scope = scope.owner
        }
        return defaultValue
    }

    function provide<R>(value: T, fn: () => R): R {
        return withContext(value, fn)
    }

    function Context(props: { value: T; children: GnimNode }) {
        const { value, children } = props
        return withContext(value, () => resolveNode(children))
    }

    return (ctx = Object.assign(Context, { use, provide, $$typeof: "context" }))
}

/**
 * Gets the scope that owns the currently running code.
 *
 * @example
 *
 * ```ts
 * const scope = getScope()
 * setTimeout(() => {
 *   // This callback gets run without an owner scope.
 *   // Restore owner via scope.run:
 *   scope.run(() => {
 *     const foo = FooContext.use()
 *     onCleanup(() => {
 *       print("some cleanup")
 *     })
 *   })
 * }, 1000)
 * ```
 */
export function getScope(): Scope {
    if (!Scope.current) {
        throw Error("cannot get scope: out of tracking context")
    }

    return Scope.current
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 */
export function onCleanup(callback: Fn) {
    if (!Scope.current) {
        console.error(Error("out of tracking context: will not be able to cleanup"))
    }

    Scope.current?.cleanups.unshift(callback)
}

function onMount(fn: Fn) {
    let scope = Scope.current

    while (scope) {
        if (scope.after) {
            scope.after.push(fn)
            return
        } else {
            scope = scope.owner
        }
    }
}

/**
 * Creates a root {@link Scope} that when disposed will remove
 * any child signal handler or state observer.
 *
 * @example
 *
 * ```tsx
 * const [n] = state(0)
 * createRoot((dispose) => {
 *   effect(() => {
 *     console.log(`value: ${n()}`)
 *
 *     if (n() === 5) {
 *       dispose()
 *     }
 *   })
 * })
 * ```
 */
export function createRoot<T>(fn: (dispose: Fn) => T, parent?: Scope) {
    const scope = new Scope(parent)
    return scope.run(() => fn(() => scope.dispose()))
}

const AccessStack = new Array<Set<Accessor>>()
let EffectDepth = 0

export function isAccessor(instance: unknown): instance is Accessor {
    return (
        typeof instance === "function" &&
        "peek" in instance &&
        typeof instance.peek === "function" &&
        "subscribe" in instance &&
        typeof instance.subscribe === "function" &&
        "as" in instance &&
        typeof instance.as === "function"
    )
}

export function createAccessor<T>(
    get: () => T,
    subscribe: (callback: Fn) => Fn = () => noop,
): Accessor<T> {
    function access(): T
    function access<R = T>(compute?: (value: T) => R): Accessor<R>
    function access<R = T>(compute?: (value: T) => R): Accessor<R> | T {
        if (typeof compute === "function") {
            return createComputed(() => {
                const value = get()
                AccessStack.at(-1)?.add(accessor)
                return untrack(() => compute(value))
            })
        }

        AccessStack.at(-1)?.add(accessor)
        return get()
    }

    function as<R = T>(fn: (value: T) => R): Accessor<R> {
        return createAccessor(() => fn(get()), subscribe)
    }

    const accessor: Accessor<T> = Object.assign(access, {
        as,
        peek: get,
        subscribe: subscribe,
        toString(): string {
            return `Accessor { ${get()} }`
        },
        [Symbol.toPrimitive]() {
            console.warn("Accessor implicitly converted to a primitive value.")
            return `Accessor { ${get()} }`
        },
    })

    return accessor
}

export type Setter<T> = {
    /* eslint-disable @typescript-eslint/no-unsafe-function-type */
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
export function createState<T>(init: T, options?: StateOptions<NoInfer<T>>): State<T> {
    let currentValue = init

    const observers = new Set<Fn>()
    const equals = options?.equals ?? Object.is

    function get(): T {
        return currentValue
    }

    function subscribe(callback: Fn): Fn {
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

    currentValue = devHooks.createState(init, get)
    return [createAccessor(get, subscribe), set]
}

function push<T>(fn: () => T) {
    const deps = new Set<Accessor>()
    AccessStack.push(deps)
    const res = fn()
    AccessStack.pop()
    return [res, deps] as const
}

/**
 * Lets you read values without tracking them.
 *
 * @example
 *
 * ```
 * let a: Accessor<number>
 * let b: Accessor<number>
 *
 * effect(() => {
 *  // will re-run when `a` changes but not when `b` changes
 *   print(a(), untrack(() => b()))
 * })
 * ```
 */
export function untrack<T>(fn: () => T) {
    return push(fn)[0]
}

function diff(prev: Map<Accessor, Fn>, next: Set<Accessor>, fn: Fn) {
    const newDeps = new Map<Accessor, Fn>()

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

export function createComputed<T>(fn: (prev?: T) => T): Accessor<T> {
    const parentScope = Scope.current

    const observers = new Set<Fn>()
    const state: { value: null; dirty: true } | { value: T; dirty: false } = {
        value: null,
        dirty: true,
    }

    let scope = new Scope(parentScope)
    let deps = new Map<Accessor, Fn>()

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

    function subscribe(callback: Fn): Fn {
        if (observers.size === 0) {
            if (EffectDepth > 0) {
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
                invalidate()
            }
        }
    }

    function get(): T {
        if (!state.dirty) {
            return state.value
        }

        if (observers.size === 0) {
            if (EffectDepth > 0) {
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
    let currentDeps = new Map<Accessor, Fn>()
    let currentScope = new Scope(parentScope)

    function syncEffect() {
        EffectDepth++
        currentScope.dispose()
        currentScope = new Scope(parentScope)

        const [value, deps] = currentScope.run(() => push(() => fn(currentValue)))

        currentDeps = diff(currentDeps, deps, syncEffect)
        currentValue = value
        EffectDepth--
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

    parentScope.cleanups.unshift(dispose)
    if (opts?.immediate) {
        syncEffect()
    } else {
        onMount(syncEffect)
    }
}

/**
 * Create a derived reactive value which tracks its dependencies and reruns the computation
 * whenever a dependency changes. The resulting {@link Accessor} will only notify observers
 * when the computed value has changed.
 *
 * This operation is also known as `memo` in other libraries.
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
    let dispose: Fn

    const equals = opts?.equals ?? Object.is
    const value = createComputed(fn)
    const subscribers = new Set<Fn>()

    function subscribe(callback: Fn): Fn {
        if (subscribers.size === 0) {
            EffectDepth += 1
            currentValue = value.peek()
            init = true
            dispose = value.subscribe(() => {
                EffectDepth += 1
                const v = value.peek()
                if (!equals(currentValue, v)) {
                    currentValue = v
                    Array.from(subscribers).forEach((cb) => cb())
                }
                EffectDepth -= 1
            })
            EffectDepth -= 1
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

    // TODO: refactor
    if (Scope.current) {
        Scope.current.cleanups.unshift(subscribe(noop))
    }

    return createAccessor(get, subscribe)
}

type PropKeys<O> = O extends GObject.Object ? Keyof<O["$readableProperties"]> : never
type Prop<O, K> = O extends GObject.Object
    ? K extends PropKeys<O>
        ? O["$readableProperties"][K]
        : never
    : never
type NProp<O, K> = NonNullable<Prop<O, K>>

/**
 * Reactively reference a {@link GObject.Object}'s registered property.
 *
 * @param object The {@link GObject.Object} to create the {@link Accessor} on.
 * @param property One of its registered properties.
 * @returns Accessor which references the property value
 */
export function ref<O extends GObject.Object, P extends PropKeys<O>>(
    object: O,
    property: P,
): Accessor<Prop<O, P>>

export function ref<
    O extends GObject.Object,
    P1 extends PropKeys<O>,
    P2 extends PropKeys<NProp<O, P1>>,
>(
    object: O,
    property1: P1,
    property2: P2,
): Accessor<null extends Prop<O, P1> ? Prop<NProp<O, P1>, P2> | null : Prop<NProp<O, P1>, P2>>

export function ref<
    O extends GObject.Object,
    P1 extends PropKeys<O>,
    P2 extends PropKeys<NProp<O, P1>>,
    P3 extends PropKeys<NProp<NProp<O, P1>, P2>>,
>(
    object: O,
    property1: P1,
    property2: P2,
    property3: P3,
): Accessor<
    null extends Prop<O, P1>
        ? Prop<NProp<NProp<O, P1>, P2>, P3> | null
        : null extends Prop<NProp<O, P1>, P2>
          ? Prop<NProp<NProp<O, P1>, P2>, P3> | null
          : Prop<NProp<NProp<O, P1>, P2>, P3>
>

export function ref<
    O extends GObject.Object,
    P1 extends PropKeys<O>,
    P2 extends PropKeys<NProp<O, P1>>,
    P3 extends PropKeys<NProp<NProp<O, P1>, P2>>,
    P4 extends PropKeys<NProp<NProp<NProp<O, P1>, P2>, P3>>,
>(
    object: O,
    property1: P1,
    property2: P2,
    property3: P3,
    property4: P4,
): Accessor<
    null extends Prop<O, P1>
        ? Prop<NProp<NProp<NProp<O, P1>, P2>, P3>, P4> | null
        : null extends Prop<NProp<O, P1>, P2>
          ? Prop<NProp<NProp<NProp<O, P1>, P2>, P3>, P4> | null
          : null extends Prop<NProp<NProp<O, P1>, P2>, P3>
            ? Prop<NProp<NProp<NProp<O, P1>, P2>, P3>, P4> | null
            : Prop<NProp<NProp<NProp<O, P1>, P2>, P3>, P4>
>

export function ref<T>(object: GObject.Object, key: string, ...props: string[]): Accessor<T> {
    if (props.length === 0) {
        function subscribe(callback: Fn): Fn {
            const id = connect(object, `notify::${key}`, () => callback())
            return () => disconnect(object, id)
        }

        function get(): T {
            if (object instanceof GObject.Object) {
                const getter = `get_${key.replaceAll("-", "_")}` as keyof typeof object

                if (getter in object && typeof object[getter] === "function") {
                    return (object[getter] as () => unknown)() as T
                }

                if (key in object) return object[key as keyof typeof object] as T
            }

            throw Error(`cannot get property "${key}" on "${object}"`)
        }

        return createAccessor(get, subscribe)
    }

    return createComputed(() => {
        let v = ref(object as any, key)()
        for (const prop of props) {
            if (prop) v = v !== null ? ref(v, prop)() : null
        }
        return v
    })
}

type SignalsOf<O> = O extends GObject.Object
    ? {
          [S in Keyof<O["$signals"]> as S extends `${infer Name}::{}`
              ? Name extends "notify"
                  ? never
                  : `${Name}::${string}`
              : S]: O["$signals"][S]
      } & {
          [S in Keyof<O["$readableProperties"]> as `notify::${S}`]: (
              pspec: GObject.ParamSpec<O["$readableProperties"][S]>,
          ) => void
      }
    : never

type ConnectionCallback<
    O extends GObject.Object,
    S extends keyof SignalsOf<O>,
> = SignalsOf<O>[S] extends (...args: infer Args) => infer Return
    ? (...args: Args) => Return
    : never

/**
 * Connect a side-effect to a GObject signal.
 */
export function connectSignal<O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: ConnectionCallback<O, S>,
): void {
    const id = connect(object, signal, (_, ...args) => handler(...args))
    onCleanup(() => disconnect(object, id))
}
