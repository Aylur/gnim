import { resolveNode, type GnimNode } from "./element.js"
import * as Signal from "./signal.js"

interface DevHooks {
    createState<T>(init: T, get: () => T): T
}

/** @internal */
export const devHooks: DevHooks = {
    createState: (init) => init,
}

const accessorType = Symbol("gnim.type.accessor")

export type Accessed<T> = T extends Accessor<infer V> ? V : never
export type MaybeAccessor<T> = T | Accessor<T>

/**
 * Accessors are functions that let you read a value and track it in
 * reactive scopes so that when they change the reader is notified.
 */
export interface Accessor<T = unknown> {
    /**
     * Get the current value and track it as a dependency in reactive scopes.
     * @returns The current value.
     */
    (): T

    /**
     * Create a new {@link Accessor} that applies a transformation on its value when read.
     * This operation is also known as `map` in other languages.
     * You might want to use {@link computed} instead, since this does not memoize the result.
     * @param fn The transformation to apply. Should be a pure function.
     */
    as<R = T>(fn: (value: T) => R): Accessor<R>

    /**
     * Get the current value **without** tracking it as a dependency in reactive scopes.
     * @returns The current value.
     */
    peek(): T
}

/**
 * Subscribe for value changes.
 *
 * The subscription is disposed together with the current {@link Scope}, if there
 * is one. Outside of a scope you need to dispose it yourself when it is no longer used.
 *
 * @param track Function reading accessors to track.
 * @param callback The function to run when a tracked value changes.
 * @returns Unsubscribe function.
 *
 * @example
 *
 * ```ts
 * let a: Accessor<number>
 * let b: Accessor<number>
 *
 * const dispose = subscribe(a, () => print(a()))
 * dispose() // stop subscription manually
 *
 * subscribe(() => { a(); b() }, () => print(a(), b()))
 * ```
 */
export function subscribe<T>(track: () => void, callback: (prev?: T) => T): Signal.Fn {
    let first = true
    const effect = new Signal.Effect<T>((prev) => {
        track()
        if (first) {
            return void (first = false) as T
        } else {
            return Signal.untrack(callback, prev)
        }
    })
    effect.run()
    return () => effect.dispose()
}

/**
 * Scopes own child scopes, cleanup and mount callbacks and context values.
 * Disposing a scope disposes its children recursively.
 */
export type Scope = Signal.Scope

/**
 * Context lets components pass information deep down
 * without explicitly passing props.
 *
 * @see createContext
 */
export interface Context<T = unknown> extends Signal.Context<T> {
    /**
     * Read the value provided by the closest provider
     * or the default value when there is none.
     */
    use(): T

    /**
     * Run a function in a new {@link Scope} that provides `value`.
     * @returns The value returned by the function.
     */
    provide<R>(value: T, fn: () => R): R

    /**
     * Provider component: `children` read `value` through {@link use}.
     */
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
        const scope = Signal.createScope()
        return Signal.runScope(scope, () => {
            Signal.setContext(ctx, value)
            return fn()
        })
    }

    function use(): T {
        return Signal.getContext(ctx)
    }

    function provide<R>(value: T, fn: () => R): R {
        return withContext(value, fn)
    }

    function Context(props: { value: T; children: GnimNode }) {
        const { value, children } = props
        return withContext(value, () => resolveNode(children))
    }

    return (ctx = Object.assign(Context, {
        defaultValue,
        use,
        provide,
    }))
}

/**
 * Gets the scope that owns the currently running code.
 *
 * @throws when called outside of a scope.
 *
 * @example
 *
 * ```ts
 * const scope = getScope()
 * setTimeout(() => {
 *   // This callback gets run without an owner scope.
 *   // Restore owner via runScope:
 *   runScope(scope, () => {
 *     const foo = FooContext.use()
 *     onCleanup(() => {
 *       print("some cleanup")
 *     })
 *   })
 * }, 1000)
 * ```
 */
export function getScope(): Scope {
    const scope = Signal.getScope()

    if (!scope) {
        throw Error("cannot get scope: out of tracking context")
    }

    return scope
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 *
 * Cleanups run in reverse registration order, when the scope is disposed.
 *
 * @throws when called outside of a scope.
 */
export function onCleanup(callback: Signal.Fn) {
    Signal.onCleanup(callback)
}

/**
 * Attach a callback to run after the current {@link Scope} returns.
 * When the scope is already mounted, or there is no scope, the callback runs
 * immediately. Mount callbacks run untracked.
 */
export function onMount(fn: Signal.Fn) {
    const scope = Signal.getScope()
    if (!scope || scope.mounted) {
        untrack(fn)
    } else {
        Signal.onMount(fn)
    }
}

/**
 * Creates a new {@link Scope} and runs `fn` in it.
 * Disposing the scope disposes every child scope, effect and cleanup created inside.
 *
 * @param fn Receives a function that disposes the root.
 * @param parent The scope to attach to, so that disposing it also disposes this root.
 * Defaults to the current scope. Pass `null` for a root that is only disposed explicitly.
 * @returns The value returned by `fn`.
 *
 * @example
 *
 * ```tsx
 * const [n] = createState(0)
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
export function createRoot<T>(fn: (dispose: Signal.Fn) => T, parent?: Scope | null) {
    const scope = Signal.createScope(parent)
    return Signal.runScope(scope, () => fn(() => scope.dispose()))
}

/**
 * Check if a variable is an {@link Accessor}
 */
export function isAccessor(instance: unknown): instance is Accessor {
    return (
        typeof instance === "function" &&
        "$$typeof" in instance &&
        instance.$$typeof === accessorType
    )
}

/**
 * Create an Accessor. This let's you integrate other systems that implement the
 * *Observable* pattern into Gnim's reactive system.
 *
 * @example
 * ```ts
 * let object: GObject.Object
 *
 * return createAccessor(
 *   () => object.property,
 *   (notify) => {
 *     const id = object.connect("notify::property", notify)
 *     return () => object.disconnect(id)
 *   },
 * )
 * ```
 *
 * When a subscription is not given the getter is simply wrapped as an Accessor.
 * You should generally not wrap getters for no reason, use {@link computed} instead.
 */
export function createAccessor<T>(
    get: () => T,
    subscribe?: (callback: Signal.Fn) => Signal.Fn,
): Accessor<T> {
    let access: () => T

    if (subscribe) {
        const external = new Signal.External(get, subscribe)
        access = () => external.get()
    } else {
        access = () => get()
    }

    function peek(): T {
        return untrack(access)
    }

    function as<R = T>(fn: (value: T) => R): Accessor<R> {
        return createAccessor(() => {
            const value = access()
            return Signal.untrack(fn, value)
        })
    }

    return Object.assign(access, {
        $$typeof: accessorType,
        as,
        peek,
        toString() {
            return `Accessor { ${peek()} }`
        },
        [Symbol.toPrimitive]() {
            console.warn("Accessor implicitly converted to a primitive value.")
            return `Accessor { ${peek()} }`
        },
    })
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
 *
 * @param init The initial value.
 * @returns An {@link Accessor} and a setter function.
 *
 * @example
 *
 * ```ts
 * const [count, setCount] = createState(0)
 *
 * setCount(1)
 * setCount((prev) => prev + 1)
 * ```
 */
export function createState<T>(init: T, options?: StateOptions<NoInfer<T>>): State<T> {
    const signal = new Signal.Signal(init, options?.equals)

    signal.set(devHooks.createState(init, get))

    function get(): T {
        return signal.get()
    }

    function set(newValue: unknown): void {
        const value: T = typeof newValue === "function" ? newValue(signal.pendingValue) : newValue
        signal.set(value)
    }

    return [createAccessor(get), set]
}

type EffectOptions = {
    /**
     * Run the effect immediately instead of after the {@link Scope} returns.
     */
    immediate?: boolean
}

/**
 * Scedule a function which tracks reactive values accessed within
 * and re-runs synchronously whenever they change.
 *
 * Errors thrown by `fn` propagate to the code that triggered the run.
 *
 * @param fn Receives the value returned by the previous run.
 * @returns A function that disposes the effect.
 *
 * @example
 *
 * ```ts
 * let count: Accessor<number>
 *
 * const dispose = effect(() => {
 *   print(`count is ${count()}`)
 *   onCleanup(() => print("count is about to change"))
 * })
 *
 * dispose() // stop effect manually
 * ```
 */
export function effect<T = void>(fn: (prev?: T) => T, opts?: EffectOptions): Signal.Fn {
    const effect = new Signal.Effect(fn)
    if (opts?.immediate || !effect.parent || effect.parent.mounted) {
        effect.run()
    } else {
        Signal.onMount(() => effect.run())
    }
    return () => effect.dispose()
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
    const computed = new Signal.Computed(fn, opts?.equals)
    return createAccessor(computed.get.bind(computed))
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
export function untrack<Args extends Array<any>, T>(fn: (...args: Args) => T, ...args: Args): T {
    return Signal.untrack(fn, ...args)
}

/**
 * Group multiple updates so downstream computations run once after the batch
 * completes instead of after each individual update.
 *
 * @example
 *
 * ```
 * const [count, setCount] = createState(0);
 * const [total, setTotal] = createState(0);
 *
 * effect(() => console.log(`${count()} / ${total()}`)); // logs "0 / 0"
 *
 * setCount(1); // logs "1 / 0"
 * setTotal(5); // logs "1 / 5"
 *
 * batch(() => {
 *   setCount(2);
 *   setTotal(10);
 * }); // logs "2 / 10"
 * ```
 */
export function batch(fn: Signal.Fn): void {
    return Signal.batch(fn)
}

/**
 * Run a function with under the given {@link Scope}.
 * Use it to re-enter a scope from asynchronous callbacks.
 *
 * @throws when the scope is already disposed.
 * @see getScope
 */
export function runScope<T>(scope: Scope, fn: () => T): T {
    return Signal.runScope(scope, fn)
}
