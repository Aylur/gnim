import GObject from "gi://GObject"
import Gio from "gi://Gio"
import { kebabify } from "../util"

type SubscribeCallback = () => void
type DisposeFunction = () => void
type SubscrubeFunction = (callback: SubscribeCallback) => DisposeFunction

export type Accessed<T> = T extends Accessor<infer V> ? V : never

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Accessor<T = unknown> extends Function {
    static $gtype = GObject.TYPE_JSOBJECT as unknown as GObject.GType<Accessor>

    /** @experimental */
    static evaluating?: Set<Accessor<unknown>>

    #get: () => T
    #subscribe: SubscrubeFunction

    constructor(get: () => T, subscribe?: SubscrubeFunction) {
        super("return arguments.callee._call.apply(arguments.callee, arguments)")
        this.#subscribe = subscribe ?? (() => () => void 0)
        this.#get = get
    }

    /**
     * Subscribe for value changes.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: SubscribeCallback): DisposeFunction {
        return this.#subscribe(callback)
    }

    /**
     * @returns The current value.
     */
    get(): T {
        Accessor.evaluating?.add(this)
        return this.#get()
    }

    protected _call<R = T>(transform: (value: T) => R): Accessor<R> {
        return new Accessor(() => transform(this.#get()), this.#subscribe)
    }

    toString(): string {
        return `Accessor<${this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("Accessor implicitly converted to a primitive value.")
        return this.toString()
    }
}

export interface Accessor<T> {
    /**
     * Create a new `Accessor` that applies a transformation on its value.
     * @param transform The transformation to apply. Should be a pure function.
     */
    <R = T>(transform: (value: T) => R): Accessor<R>
}

export type Setter<T> = {
    (value: T): void
    (value: (prev: T) => T): void
}

export type State<T> = [Accessor<T>, Setter<T>]

/**
 * Create a writable signal.
 *
 * @param init The intial value of the signal
 * @returns An `Accessor` and a setter function
 */
export function createState<T>(init: T): State<T> {
    let currentValue = init
    const subscribers = new Set<SubscribeCallback>()

    const subscribe: SubscrubeFunction = (callback) => {
        subscribers.add(callback)
        return () => subscribers.delete(callback)
    }

    const set = (newValue: unknown) => {
        const value: T = typeof newValue === "function" ? newValue(currentValue) : newValue
        if (currentValue !== value) {
            currentValue = value
            subscribers.forEach((cb) => cb())
        }
    }

    return [new Accessor(() => currentValue, subscribe), set as Setter<T>]
}

/**
 * ```ts Example
 * let a: Accessor<number>
 * let b: Accessor<string>
 *
 * const c: Accessor<[number, string]> = createComputed([a, b])
 *
 * const d: Accessor<string> = createComputed([a, b], (a: number, b: string) => `${a} ${b}`)
 * ```
 *
 * Create an `Accessor` which is computed from a list of `Accessor`s.
 * @param deps List of `Accessors`.
 * @param transform An optional transform function.
 * @returns The computed `Accessor`.
 */
export function createComputed<
    const Deps extends Array<Accessor<any>>,
    Args extends { [K in keyof Deps]: Accessed<Deps[K]> },
    V = Args,
>(deps: Deps, transform?: (...args: Args) => V): Accessor<V> {
    let dispose: Array<DisposeFunction>
    const subscribers = new Set<SubscribeCallback>()
    const cache = new Array<unknown>(deps.length)

    const subscribe: SubscrubeFunction = (callback) => {
        if (subscribers.size === 0) {
            dispose = deps.map((dep, i) =>
                dep.subscribe(() => {
                    const value = dep.get()
                    if (cache[i] !== value) {
                        cache[i] = dep.get()
                        subscribers.forEach((cb) => cb())
                    }
                }),
            )
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                dispose.map((cb) => cb())
                dispose.length = 0
                cache.length = 0
            }
        }
    }

    const get = (): V => {
        const args = deps.map((dep, i) => {
            if (!cache[i]) {
                cache[i] = dep.get()
            }

            return cache[i]
        })

        return transform ? transform(...(args as Args)) : (args as V)
    }

    return new Accessor(get, subscribe)
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

// TODO: support nested bindings
// export function createBinding<
//     T extends GObject.Object,
//     P1 extends keyof T,
//     P2 extends keyof NonNullable<T[P1]>,
// >(
//     object: T,
//     property1: Extract<P1, string>,
//     property2: Extract<P2, string>,
// ): Accessor<NonNullable<T[P1]>[P2]>

/**
 * Create an `Accessor` on a `Gio.Settings`'s `key`.
 * Values are recursively unpacked.
 *
 * @param object The `Gio.Settings` to create the `Accessor` on.
 * @param key The settings key
 */
export function createBinding<T>(settings: Gio.Settings, key: string): Accessor<T>

export function createBinding<T>(object: GObject.Object | Gio.Settings, key: string): Accessor<T> {
    const prop = kebabify(key) as keyof typeof object

    const subscribe: SubscrubeFunction = (callback) => {
        const sig = object instanceof Gio.Settings ? "changed" : "notify"
        const id = object.connect(`${sig}::${prop}`, () => callback())
        return () => object.disconnect(id)
    }

    const get = (): T => {
        if (object instanceof Gio.Settings) {
            return object.get_value(key).recursiveUnpack()
        } else {
            const getter = `get_${prop.replaceAll("-", "_")}` as keyof typeof object

            if (getter in object && typeof object[getter] === "function") {
                return (object[getter] as () => unknown)() as T
            }

            if (prop in object) return object[prop] as T
            if (key in object) return object[key as keyof typeof object] as T

            throw Error(`cannot get property ${key}`)
        }
    }

    return new Accessor(get, subscribe)
}

/**
 * @experimental
 *
 * ```ts Example
 * const value: Accessor<string> = createConnection(
 *   "initial value",
 *   [obj1, "sig-name", (...args) => "str"],
 *   [obj2, "sig-name", (...args) => "str"]
 * )
 * ```
 *
 * Create an `Accessor` which sets up a list of `GObject.Object` signal connections.
 * @param init The initial value
 * @param signals A list of `GObject.Object`, signal name and callback pairs to connect.
 */
export function createConnection<T>(
    init: T,
    ...signals: Array<
        [
            GObject.Object,
            string,
            /**
             * @param args Parameters coming from the signal, emitting object not included.
             * @returns new value
             */
            (...args: Array<any>) => T,
        ]
    >
) {
    let value = init
    let dispose: Array<DisposeFunction>
    const subscribers = new Set<SubscribeCallback>()

    const subscribe: SubscrubeFunction = (callback) => {
        if (subscribers.size === 0) {
            dispose = signals.map(([object, signal, callback]) => {
                const id = object.connect(signal, (_, ...args: unknown[]) => {
                    value = callback(...args)
                })
                return () => object.disconnect(id)
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

    return new Accessor(() => value, subscribe)
}

/**
 * @experimental
 *
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
export function createExternal<T>(
    init: T,
    producer: (set: Setter<T>) => DisposeFunction,
): Accessor<T> {
    let currentValue = init
    let dispose: DisposeFunction
    const subscribers = new Set<SubscribeCallback>()

    const subscribe: SubscrubeFunction = (callback) => {
        if (subscribers.size === 0) {
            dispose = producer((v: unknown) => {
                const newValue: T = typeof v === "function" ? v(currentValue) : v
                if (newValue !== currentValue) {
                    currentValue = newValue
                    subscribers.forEach((cb) => cb())
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
