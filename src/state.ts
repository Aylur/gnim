import GObject from "gi://GObject"
import Gio from "gi://Gio"
import { kebabify } from "./util"

type SubscribeCallback = () => void
type DisposeFunction = () => void
type SubscrubeFunction = (callback: SubscribeCallback) => DisposeFunction

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Accessor<T = unknown> extends Function {
    static $gtype = GObject.TYPE_JSOBJECT as unknown as GObject.GType<Accessor>

    static [Symbol.hasInstance](instance: unknown) {
        return (
            instance instanceof State || Function.prototype[Symbol.hasInstance].call(this, instance)
        )
    }

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
        return this.#get()
    }

    /**
     * Create a new `Accessor` that applies a transformation on its value.
     * @param transform The transformation to apply. Should be a pure function.
     */
    as<R = T>(transform: (value: T) => R): Accessor<R> {
        return new Accessor(() => transform(this.get()), this.subscribe.bind(this))
    }

    protected _call<R = T>(transform: (value: T) => R): Accessor<R> {
        return new Accessor(() => transform(this.get()), this.subscribe.bind(this))
    }

    toString(): string {
        return `Accessor<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("Accessor implicitly converted to a primitive value.")
        return this.toString()
    }
}

export interface Accessor<T> {
    <R = T>(transform: (value: T) => R): Accessor<R>
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class State<T = unknown> extends Function implements Accessor<T> {
    static $gtype = GObject.TYPE_JSOBJECT as unknown as GObject.GType<State>

    private subscribers: Set<SubscribeCallback>
    protected value: T

    constructor(init: T) {
        super("return arguments.callee._call.apply(arguments.callee, arguments)")
        this.value = init
        this.subscribers = new Set()
    }

    subscribe(callback: SubscribeCallback): DisposeFunction {
        this.subscribers.add(callback)
        return () => this.subscribers.delete(callback)
    }

    get(): T {
        return this.value
    }

    /**
     * Set the value of this `State`
     */
    set(value: T) {
        if (this.value !== value) {
            this.value = value
            this.subscribers.forEach((cb) => cb())
        }
    }

    protected _call<R = T>(transform: (value: T) => R): Accessor<R> {
        return new Accessor(() => transform(this.get()), this.subscribe.bind(this))
    }
}

export interface State<T> extends Accessor<T> {
    <R = T>(transform: (value: T) => R): Accessor<R>
}

/**
 * Create an `Accessor` on a `GObject.Object`'s `property`.
 * @param object The `GObject.Object` to create the `Accessor` on.
 * @param property One of its registered property
 */
export function bind<T extends GObject.Object, P extends keyof T>(
    object: T,
    property: Extract<P, string>,
): Accessor<T[P]>

/**
 * Create an `Accessor` on a `Gio.Settings`'s `key`.
 * @param object The `Gio.Settings` to create the `Accessor` on.
 * @param key The settings key
 */
export function bind<T>(settings: Gio.Settings, key: string): Accessor<T>

export function bind<T>(object: GObject.Object | Gio.Settings, key: string): Accessor<T> {
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
 * ```ts Example
 * let a: Accessor<number>
 * let b: Accessor<string>
 * const c: Accessor<[number, string]> = computed([a, b])
 * const d: Accessor<string> = computed([a, b], (a: number, b: string) => `${a} ${b}`)
 * ```
 *
 * Create an `Accessor` which is computed from a list of `Accessor`s.
 * @param deps List of `Accessors`.
 * @param transform An optional transform function.
 * @returns The computed `Accessor`.
 */
export function compute<
    const Deps extends Array<Accessor<any>>,
    Args extends {
        [K in keyof Deps]: Deps[K] extends Accessor<infer T> ? T : never
    },
    V = Args,
>(deps: Deps, transform?: (...args: Args) => V): Accessor<V> {
    const cache = new Array<unknown>(deps.length)

    const subscribe: SubscrubeFunction = (callback) => {
        const dispose = deps.map((dep, i) =>
            dep.subscribe(() => {
                cache[i] = dep.get()
                callback()
            }),
        )

        return () => dispose.forEach((cb) => cb())
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
 * ```ts Example
 * const value: Accessor<string> = observe(
 *   "initial value",
 *   [obj1, "sig-name", (...args) => "str"],
 *   [obj2, "sig-name", (...args) => "str"]
 * )
 * ```
 *
 * Create an `Accessor` which observes a list of `GObject.Object` signals.
 * @param init The initial value
 * @param signals A list of `GObject.Object`, signal name and callback pairs to observe.
 */
export function observe<T>(
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
 * Attempt to subscribe to an Accessor while auto disconnecting on destroy signals.
 */
export function hook(object: GObject.Object, accessor: Accessor, callback: SubscribeCallback) {
    const dispose = accessor.subscribe(callback)

    // @ts-expect-error missing $gtype annotation
    const t = object.constructor.$gtype as GObject.GType

    if (GObject.signal_lookup("destroy", t)) {
        object.connect("destroy", dispose)
    } else {
        console.warn(new Error("will not be able to automatically disconnect from signal"))
    }
}

function set(obj: object, prop: string, value: any) {
    const setter = `set_${kebabify(prop).replaceAll("-", "_")}` as keyof typeof obj

    if (setter in obj && typeof obj[setter] === "function") {
        ;(obj[setter] as (v: any) => void)(value)
    } else {
        Object.assign(obj, { [prop]: value })
    }
}

/**
 * Create a synchronization between a `GObject.Object` and an `Accessor`.
 * This is somewhat equivalent to `GObject.Object.bind_property_full`.
 * @param object Target object.
 * @param property - Target property.
 * @param accessor - The Accessor the object will subscribe to.
 * @returns The disconnect function.
 */
export function sync<O extends GObject.Object, P extends keyof O>(
    object: O,
    property: Extract<P, string>,
    accessor: Accessor<O[P]>,
): DisposeFunction {
    set(object, property, accessor.get())

    const dispose = accessor.subscribe(() => set(object, property, accessor.get()))

    // @ts-expect-error missing $gtype annotation
    const t = object.constructor.$gtype as GObject.GType

    if (GObject.signal_lookup("destroy", t)) {
        object.connect("destroy", dispose)
    } else {
        console.warn(new Error("will not be able to automatically disconnect from signal"))
    }

    return dispose
}
