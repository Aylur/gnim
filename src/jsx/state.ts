/* eslint-disable @typescript-eslint/no-unsafe-declaration-merging */

import GObject from "gi://GObject"
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import { type Pascalify, camelify, kebabify } from "../util.js"
import type { DeepInfer, RecursiveInfer } from "../variant.js"
import { Scope } from "./scope.js"

type Callback = () => void
type DisposeFn = () => void

const nil = Symbol("nil")
const accessStack = new Array<Set<Accessor>>()
const { connect, disconnect } = GObject.Object.prototype

export type Accessed<T> = T extends Accessor<infer V> ? V : never

export interface Accessor<T> {
    /**
     * Shorthand for `createComputed(() => compute(accessor()))`
     * @returns The current value.
     */
    <R = T>(compute: (value: T) => R): Accessor<R>

    /**
     * Create a new `Accessor` that applies a transformation on its value without caching.
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
}

export class Accessor<T = unknown> extends Function {
    static $gtype = GObject.TYPE_JSOBJECT as unknown as GObject.GType<Accessor>

    #get: () => T
    #subscribe: (callback: Callback) => DisposeFn

    constructor(get: () => T, subscribe: (callback: Callback) => DisposeFn) {
        super("return arguments.callee._call.apply(arguments.callee, arguments)")
        this.#subscribe = subscribe
        this.#get = get
    }

    /**
     * Subscribe for value changes.
     * This method is **not** scope aware; you need to dispose it when it is no longer used.
     * You might want to consider using {@link createEffect} instead.
     * @param callback The function to run when the value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: Callback): DisposeFn {
        return this.#subscribe(callback)
    }

    /**
     * @returns The current value.
     * @deprecated Has been renamed to {@link Accessor.prototype.peek}
     */
    get(): T {
        return this.#get()
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
        if (compute) return createComputed(() => compute(this()))

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

/**
 * Create a writable signal.
 * @param init The intial value of the signal
 * @returns An `Accessor` and a setter function
 */
export function createState<T>(init: T): State<T> {
    let currentValue = init
    const subscribers = new Set<Callback>()

    function subscribe(callback: Callback): DisposeFn {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
    }

    function set(newValue: unknown): void {
        const value: T = typeof newValue === "function" ? newValue(currentValue) : newValue
        if (!Object.is(currentValue, value)) {
            currentValue = value
            Array.from(subscribers).forEach((cb) => cb())
        }
    }

    function get(): T {
        return currentValue
    }

    return [new Accessor(get, subscribe), set]
}

/** marks wether we are in an {@link effect} scope */
let effectScope = false

function push<T>(fn: () => T) {
    const deps = new Set<Accessor>()
    accessStack.push(deps)
    const res = fn()
    accessStack.pop()
    return [res, deps] as const
}

function createComputedProducer<T>(
    _producer: (DEPRECATED_track: <V>(signal: Accessor<V>) => V) => T,
): Accessor<T> {
    let cachedValue: T | typeof nil = nil
    let currentDeps = new Map<Accessor, DisposeFn>()

    // in an effect scope we want to immediately track dependencies
    // and cache the result to avoid a recomputation after the effect scope
    let preValue: T | typeof nil = nil
    let preDeps = new Set<Accessor>()

    const subscribers = new Set<Callback>()
    const producer = () =>
        _producer((s) => {
            // we might want to console.warn here
            return s()
        })

    function invalidate() {
        cachedValue = nil
        Array.from(subscribers).forEach((cb) => cb())
    }

    function computeEffect() {
        const [res, deps] = push(producer)
        const newDeps = new Map<Accessor, DisposeFn>()

        for (const [dep, dispose] of currentDeps) {
            if (!deps.has(dep)) {
                dispose()
            } else {
                newDeps.set(dep, dispose)
            }
        }

        for (const dep of deps) {
            if (!newDeps.has(dep)) {
                newDeps.set(dep, dep.subscribe(invalidate))
            }
        }

        currentDeps = newDeps
        return (cachedValue = res)
    }

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            if (effectScope) {
                cachedValue = preValue
                currentDeps = new Map([...preDeps].map((dep) => [dep, dep.subscribe(invalidate)]))
                preDeps.clear()
                preValue = nil
            } else {
                computeEffect()
            }
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                currentDeps.forEach((cb) => cb())
                currentDeps.clear()
                cachedValue = nil
            }
        }
    }

    function get(): T {
        if (cachedValue !== nil) return cachedValue

        if (subscribers.size === 0) {
            if (effectScope) {
                const [res, deps] = push(producer)
                preDeps = deps
                preValue = res
                return res
            } else {
                return producer()
            }
        }

        return computeEffect()
    }

    return new Accessor(get, subscribe)
}

function DEPRECATED_createComputedArgs<
    const Deps extends Array<Accessor<any>>,
    Args extends { [K in keyof Deps]: Accessed<Deps[K]> },
    V = Args,
>(deps: Deps, transform?: (...args: Args) => V): Accessor<V> {
    let dispose: Array<DisposeFn>
    let value: typeof nil | V = nil

    const subscribers = new Set<Callback>()
    const cache = new Array<unknown>(deps.length)

    function compute(): V {
        const args = deps.map((dep, i) => {
            if (!cache[i]) {
                cache[i] = dep.peek()
            }

            return cache[i]
        })

        return transform ? transform(...(args as Args)) : (args as V)
    }

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            dispose = deps.map((dep, i) =>
                dep.subscribe(() => {
                    const newDepValue = dep.peek()
                    if (cache[i] !== newDepValue) {
                        cache[i] = newDepValue

                        const newValue = compute()
                        if (value !== newValue) {
                            value = newValue
                            Array.from(subscribers).forEach((cb) => cb())
                        }
                    }
                }),
            )
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                value = nil
                dispose.map((cb) => cb())
                dispose.length = 0
                cache.length = 0
            }
        }
    }

    function get(): V {
        return value !== nil ? value : compute()
    }

    return new Accessor(get, subscribe)
}

/**
 * Create a computed value from a producer function which tracks
 * dependencies and invalidates tha value whenever they change.
 * The result is cached and is only computed on access.
 *
 * ```ts Example
 * let a: Accessor<number>
 * let b: Accessor<number>
 * const c: Accessor<number> = createComputed(() => a() + b())
 * ```
 *
 * @param producer The computation logic
 * @returns An {@link Accessor} to the value
 */
export function createComputed<T>(
    producer: (
        /** @deprecated */
        track: <V>(signal: Accessor<V>) => V,
    ) => T,
): Accessor<T>

/**
 * Create an `Accessor` which is computed from a list of given `Accessor`s.
 *
 * @deprecated Use the producer version
 *
 * ```ts
 * createComputed([dep1, dep2], (v1, v2) => v1 + v2) // ❌
 * createComputed(() => dep1() + dep2()) // ✅
 * ```
 *
 * @param deps List of `Accessors`.
 * @param transform An optional transform function.
 * @returns The computed `Accessor`.
 */
export function createComputed<
    const Deps extends Array<Accessor<any>>,
    Args extends { [K in keyof Deps]: Accessed<Deps[K]> },
    T = Args,
>(deps: Deps, transform?: (...args: Args) => T): Accessor<T>

export function createComputed(
    ...args:
        | [producer: (track: <V>(signal: Accessor<V>) => V) => unknown]
        | [deps: Array<Accessor>, transform?: (...args: unknown[]) => unknown]
) {
    const [depsOrProducer, transform] = args
    if (typeof depsOrProducer === "function") {
        return createComputedProducer(depsOrProducer)
    } else {
        return DEPRECATED_createComputedArgs(depsOrProducer, transform)
    }
}

/**
 * Runs a function tracking the dependencies and reruns whenever they change.
 * @param fn The effect logic
 * @returns Dispose function
 */
export function createEffect(fn: Callback): DisposeFn {
    let currentDeps = new Map<Accessor, DisposeFn>()

    function effect() {
        effectScope = true
        const [, deps] = push(fn)
        const newDeps = new Map<Accessor, DisposeFn>()

        for (const [dep, dispose] of currentDeps) {
            if (!deps.has(dep)) {
                dispose()
            } else {
                newDeps.set(dep, dispose)
            }
        }

        for (const dep of deps) {
            if (!newDeps.has(dep)) {
                newDeps.set(dep, dep.subscribe(effect))
            }
        }

        currentDeps = newDeps
        effectScope = false
    }

    function dispose() {
        currentDeps.forEach((cb) => cb())
        currentDeps.clear()
    }

    const scope = Scope.current
    if (!scope) {
        console.warn(Error("effects created outside a `createRoot` will never be disposed"))
        effect()
        return dispose
    }

    scope.onMount(effect)
    scope.onCleanup(dispose)
    return dispose
}

/**
 * Create an `Accessor` on a `GObject.Object`'s `property`.
 *
 * @param object The `GObject.Object` to create the `Accessor` on.
 * @param property One of its registered properties.
 */
export function createBinding<T extends GObject.Object, P extends keyof T>(
    object: T,
    property: Extract<P, string>,
): Accessor<T[P]>

/**
 * Create an `Accessor` on a `Gio.Settings`'s `key`.
 * Values are recursively unpacked.
 *
 * @deprecated prefer using {@link createSettings}.
 * @param object The `Gio.Settings` to create the `Accessor` on.
 * @param key The settings key
 */
export function createBinding<T>(settings: Gio.Settings, key: string): Accessor<T>

export function createBinding<T>(object: GObject.Object | Gio.Settings, key: string): Accessor<T> {
    const prop = kebabify(key) as keyof typeof object

    function subscribe(callback: Callback): DisposeFn {
        const sig = object instanceof Gio.Settings ? "changed" : "notify"
        const id = connect.call(object, `${sig}::${prop}`, () => callback())
        return () => disconnect.call(object, id)
    }

    function get(): T {
        if (object instanceof Gio.Settings) {
            return object.get_value(key).recursiveUnpack() as T
        }

        if (object instanceof GObject.Object) {
            const getter = `get_${prop.replaceAll("-", "_")}` as keyof typeof object

            if (getter in object && typeof object[getter] === "function") {
                return (object[getter] as () => unknown)() as T
            }

            if (prop in object) return object[prop] as T
            if (key in object) return object[key as keyof typeof object] as T
        }

        throw Error(`cannot get property "${key}" on "${object}"`)
    }

    return new Accessor(get, subscribe)
}

type ConnectionHandler<
    O extends GObject.Object,
    S extends keyof O["$signals"],
    T,
> = O["$signals"][S] extends (...args: any[]) => infer R
    ? void extends R
        ? (...args: [...Parameters<O["$signals"][S]>, currentValue: T]) => T
        : never
    : never

/**
 * Create an `Accessor` which sets up a list of `GObject.Object` signal connections.
 *
 * ```ts Example
 * const value: Accessor<string> = createConnection(
 *   "initial value",
 *   [obj1, "sig-name", (...args) => "str"],
 *   [obj2, "sig-name", (...args) => "str"],
 * )
 * ```
 *
 * @param init The initial value
 * @param handler A `GObject.Object`, signal name and callback pairs to connect.
 */
export function createConnection<T, O1 extends GObject.Object, S1 extends keyof O1["$signals"]>(
    init: T,
    handler: [O1, S1, ConnectionHandler<O1, S1, T>],
): Accessor<T>

export function createConnection<
    T,
    O1 extends GObject.Object,
    S1 extends keyof O1["$signals"],
    O2 extends GObject.Object,
    S2 extends keyof O2["$signals"],
    O3 extends GObject.Object,
    S3 extends keyof O3["$signals"],
    O4 extends GObject.Object,
    S4 extends keyof O4["$signals"],
    O5 extends GObject.Object,
    S5 extends keyof O5["$signals"],
    O6 extends GObject.Object,
    S6 extends keyof O6["$signals"],
    O7 extends GObject.Object,
    S7 extends keyof O7["$signals"],
    O8 extends GObject.Object,
    S8 extends keyof O8["$signals"],
    O9 extends GObject.Object,
    S9 extends keyof O9["$signals"],
>(
    init: T,
    h1: [O1, S1, ConnectionHandler<O1, S1, T>],
    h2?: [O2, S2, ConnectionHandler<O2, S2, T>],
    h3?: [O3, S3, ConnectionHandler<O3, S3, T>],
    h4?: [O4, S4, ConnectionHandler<O4, S4, T>],
    h5?: [O5, S5, ConnectionHandler<O5, S5, T>],
    h6?: [O6, S6, ConnectionHandler<O6, S6, T>],
    h7?: [O7, S7, ConnectionHandler<O7, S7, T>],
    h8?: [O8, S8, ConnectionHandler<O8, S8, T>],
    h9?: [O9, S9, ConnectionHandler<O9, S9, T>],
) {
    let currentValue = init
    let dispose: Array<DisposeFn>

    const subscribers = new Set<Callback>()
    const signals = [h1, h2, h3, h4, h5, h6, h7, h8, h9].filter((h) => h !== undefined)

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            dispose = signals.map(([object, signal, callback]) => {
                const id = connect.call(object, signal as string, (_, ...args) => {
                    const newValue = callback(...args, currentValue)
                    if (currentValue !== newValue) {
                        currentValue = newValue
                        Array.from(subscribers).forEach((cb) => cb())
                    }
                })

                return () => disconnect.call(object, id)
            })
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                dispose.map((cb) => cb())
                dispose.length = 0
            }
        }
    }

    function get(): T {
        return currentValue
    }

    return new Accessor(get, subscribe)
}

/**
 * Create a signal from a provier function.
 * The provider is called when the first subscriber appears and the returned dispose
 * function from the provider will be called when the number of subscribers drop to zero.
 *
 * Example:
 *
 * ```ts
 * const value = createExternal(0, (set) => {
 *   const interval = setInterval(() => set((v) => v + 1))
 *   return () => clearInterval(interval)
 * })
 * ```
 *
 * @param init The initial value
 * @param producer The producer function which should return a cleanup function
 */
export function createExternal<T>(init: T, producer: (set: Setter<T>) => DisposeFn): Accessor<T> {
    let currentValue = init
    let dispose: DisposeFn
    const subscribers = new Set<Callback>()

    function subscribe(callback: Callback): DisposeFn {
        if (subscribers.size === 0) {
            dispose = producer((v: unknown) => {
                const newValue: T = typeof v === "function" ? v(currentValue) : v
                if (newValue !== currentValue) {
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

/** @experimental */
type Settings<T extends Record<string, string>> = {
    [K in keyof T as Uncapitalize<Pascalify<K>>]: Accessor<RecursiveInfer<T[K]>>
} & {
    [K in keyof T as `set${Pascalify<K>}`]: Setter<DeepInfer<T[K]>>
}

/**
 * @experimental
 *
 * Wrap a {@link Gio.Settings} into a collection of setters and accessors.
 *
 * Example:
 *
 * ```ts
 * const s = createSettings(settings, {
 *   "complex-key": "a{sa{ss}}",
 *   "simple-key": "s",
 * })
 *
 * s.complexKey.subscribe(() => {
 *   print(s.complexKey.get())
 * })
 *
 * s.setComplexKey((prev) => ({
 *   ...prev,
 *   key: { nested: "" },
 * }))
 * ```
 */
export function createSettings<const T extends Record<string, string>>(
    settings: Gio.Settings,
    keys: T,
): Settings<T> {
    return Object.fromEntries(
        Object.entries(keys).flatMap<[any, any]>(([key, type]) => [
            [
                camelify(key),
                new Accessor(
                    () => settings.get_value(key).recursiveUnpack(),
                    (callback) => {
                        const id = connect.call(settings, `changed::${key}`, callback)
                        return () => disconnect.call(settings, id)
                    },
                ),
            ],
            [
                `set${key[0].toUpperCase() + camelify(key).slice(1)}`,
                (v: unknown) => {
                    settings.set_value(
                        key,
                        new GLib.Variant(
                            type,
                            typeof v === "function" ? v(settings.get_value(key).deepUnpack()) : v,
                        ),
                    )
                },
            ],
        ]),
    )
}
