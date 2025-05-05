import GObject from "gi://GObject"
import Gio from "gi://Gio"
import { registerDestroyableType } from "./gnome/signalTracker"

const _value = Symbol("state value")
const _transformFn = Symbol("binding transformFn")
const _emitter = Symbol("binding emitter")
const _prop = Symbol("binding prop")

function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

class StateObject<T extends object> extends GObject.Object {
    static [GObject.properties] = {
        value: GObject.ParamSpec.jsobject("value", "", "", GObject.ParamFlags.READWRITE),
    }

    static [GObject.signals] = {
        destroy: { param_types: [] },
    }

    static {
        GObject.registerClass(this)
        registerDestroyableType(this)
    }

    declare value: T

    constructor(value: T) {
        super()
        this.value = value
    }
}

// TODO: consider Proxying objects to make them deeply reactive

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class State<T> extends Function {
    private [_value]: StateObject<{ $: T }>

    constructor(init: T) {
        super()
        this[_value] = new StateObject({ $: init })
        return new Proxy(this, {
            apply: (target, _, args) => target._call(args[0]),
        })
    }

    private _call(): Binding<T>

    private _call<R = T>(transform: (value: T) => R): Binding<R>

    private _call(transform?: (value: T) => unknown) {
        const b = Binding.bind(this[_value], "value")
        return transform ? b.as(({ $ }) => transform($)) : b.as(({ $ }) => $)
    }

    /**
     * @returns The current value.
     */
    get() {
        return this.value
    }

    /**
     * Set the current value.
     * *NOTE*: value is checked by reference.
     * @returns The current value.
     */
    set(value: T) {
        return (this.value = value)
    }

    /**
     * The current value.
     */
    get value(): T {
        return this[_value].value.$
    }

    set value(v: T) {
        if (v !== this[_value].value.$) {
            this[_value].value = { $: v }
        }
    }

    /**
     * Subscribe for value changes.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: (value: T) => void): () => void

    /**
     * Subscribe for value changes.
     * @param object An object to limit the lifetime of the subscription to.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(objOrCallback: GObject.Object | ((value: T) => void), callback?: (value: T) => void) {
        if (typeof objOrCallback === "function") {
            const id = this[_value].connect("notify::value", ({ value }) => objOrCallback(value.$))
            return () => this[_value].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            const unsub = hook(
                objOrCallback,
                this[_value],
                "notify::value",
                ({ value }: StateObject<{ $: T }>) => callback(value.$),
            )

            return unsub
        }
    }

    toString(): string {
        return `State<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("State implicitly converted to a primitive value.")
        return this.toString()
    }

    destroy() {
        this[_value].emit("destroy")
    }
}

export interface State<T> {
    <R>(transform: (value: T) => R): Binding<R>
    (): Binding<T>
}

export class Binding<T> {
    private [_transformFn] = (v: any) => v
    private [_emitter]: GObject.Object
    private [_prop]: string

    private constructor(emitter: GObject.Object, prop: string) {
        this[_emitter] = emitter
        this[_prop] = kebabify(prop)
    }

    /**
     * Create a `Binding` on a `State`.
     * @param object The `State` to create the `Binding` on.
     */
    static bind<T>(object: State<T>): Binding<T>

    /**
     * Create a `Binding` on a `GObject.Object`'s `property`.
     * @param object The `GObject.Object` to create the `Binding` on.
     */
    static bind<T extends GObject.Object, P extends keyof T>(
        object: T,
        property: Extract<P, string>,
    ): Binding<T[P]>

    /**
     * Create a `Binding` on a `Gio.Settings`'s `key`.
     * @param object The `Gio.Settings` to create the `Binding` on.
     */
    static bind<T>(object: Gio.Settings, key: string): Binding<T>

    static bind<T>(object: GObject.Object | State<T>, property?: string): Binding<T> {
        return object instanceof State ? object() : new Binding(object, property!)
    }

    /**
     * Create a new `Binding` that applies a transformation on its value.
     * @param transform The transformation to apply. Should be a pure function.
     */
    as<U>(transform: (v: T) => U): Binding<U> {
        const bind = new Binding(this[_emitter], this[_prop])
        bind[_transformFn] = (v: T) => transform(this[_transformFn](v))
        return bind as unknown as Binding<U>
    }

    /**
     * @returns The current value.
     */
    get(): T {
        const fn = this[_transformFn]
        const obj = this[_emitter]
        const prop = this[_prop] as keyof typeof obj

        if (obj instanceof Gio.Settings) {
            return fn(obj.get_value(prop).deepUnpack())
        }

        const getter = `get_${prop.replaceAll("-", "_")}` as keyof typeof obj

        if (getter in obj && typeof obj[getter] === "function") {
            return fn((obj[getter] as () => unknown)())
        }

        return fn(obj[prop])
    }

    /**
     * Subscribe for value changes.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(callback: (value: T) => void): () => void

    /**
     * Subscribe for value changes.
     * @param object An object to limit the lifetime of the subscription to.
     * @param callback The function to run when the current value changes.
     * @returns Unsubscribe function.
     */
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(objOrCallback: GObject.Object | ((value: T) => void), callback?: (value: T) => void) {
        const emitter = this[_emitter]

        const sig = emitter instanceof Gio.Settings ? "changed" : "notify"

        if (typeof objOrCallback === "function") {
            const id = this[_emitter].connect(`${sig}::${kebabify(this[_prop])}`, () =>
                objOrCallback(this.get()),
            )
            return () => this[_emitter].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            return hook(objOrCallback, this[_emitter], `${sig}::${kebabify(this[_prop])}`, () =>
                callback(this.get()),
            )
        }
    }

    toString(): string {
        return `Binding<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("Binding implicitly converted to a primitive value.")
        return this.toString()
    }
}

export const { bind } = Binding

function set(obj: object, prop: string, value: any) {
    const setter = `set_${prop}` as keyof typeof obj
    if (setter in obj && typeof obj[setter] === "function") {
        ;(obj[setter] as (v: any) => void)(value)
    } else {
        Object.assign(obj, { [prop]: value })
    }
}

/**
 * Create a synchronization between a `GObject.Object` and a `Binding`.
 * This is equivalent to `GObject.Object.bind_property_full`.
 * @param object Target object.
 * @param property - Target property.
 * @param binding - The Binding the object will subscribe to.
 * @returns The disconnect function.
 */
export function sync<O extends GObject.Object, P extends keyof O>(
    object: O,
    property: Extract<P, string>,
    binding: Binding<O[P]>,
): () => void {
    set(object, kebabify(property), binding.get())
    return binding.subscribe(object, (value) => set(object, kebabify(property), value))
}

/**
 * ```ts Example
 * let a: Binding<number>
 * let b: Binding<string>
 * const c: State<[number, string]> = derive([a, b])
 * const d: State<string> = derive([a, b], (a: number, b: string) => `${a} ${b}`)
 * ```
 *
 * Create a derived `State` from a list of `Binding`s.
 * @param deps List of `Bindings`.
 * @param transform An optional transform function.
 * @returns The derived `State`.
 */
export function derive<
    const Deps extends Array<Binding<any>>,
    Args extends {
        [K in keyof Deps]: Deps[K] extends Binding<infer T> ? T : never
    },
    V = Args,
>(deps: Deps, transform?: (...args: Args) => V): State<V>

/**
 * ```ts Example
 * let a: Binding<number>
 * let b: Binding<string>
 * const c: State<[number, string]> = derive(a, b)
 * const d: State<string> = derive(a, b, (a: number, b: string) => `${a} ${b}`)
 * ```
 *
 * Create a derived `State` from a list of `Binding`s.
 * @param args List of `Bindings` with the last argument being an optional transform function.
 * @returns The derived `State`.
 */
export function derive<
    const Deps extends Array<Binding<any>>,
    Args extends {
        [K in keyof Deps]: Deps[K] extends Binding<infer T> ? T : never
    },
    V = Args,
>(...args: [...Deps] | [...Deps, transform: (...args: Args) => V]): State<V>

export function derive<T>(...args: any[]) {
    let deps: Array<Binding<unknown>>
    let fn: (...args: unknown[]) => T

    if (Array.isArray(args[0])) {
        deps = args[0]
        fn = args[1] ?? ((...args: unknown[]) => args)
    } else if (typeof args.at(-1) === "function") {
        deps = args.slice(0, -1)
        fn = args.at(-1)
    } else {
        deps = args
        fn = (...args: unknown[]) => args as T
    }

    const get = () => fn(...deps.map((d) => d.get()))
    const state = new State(get())

    for (const dep of deps) {
        sync(
            state[_value],
            "value",
            dep.as(() => ({ $: get() })),
        )
    }

    return state
}

/**
 * ```ts Example
 * const state: State<string> = observe(
 *   "",
 *   [obj1, "sig-name", (...args) => "str"],
 *   [obj2, "sig-name", (...args) => "str"]
 * )
 * ```
 *
 * Create a `State` which observes a list of `GObject.Object` signals.
 * @param init The initial value of the `State`
 * @param signals A list of `GObject.Object`, signal name and callback pairs to observe.
 * @returns The observing `State`.
 */
export function observe<T>(
    init: T,
    ...signals: Array<
        [
            GObject.Object,
            string,
            /** Parameters are coming from the signal. @returns new value */ (
                ...args: Array<any>
            ) => T,
        ]
    >
) {
    const state = new State(init)
    for (const [obj, sig, callback] of signals) {
        hook(state[_value], obj, sig, (_, ...args) => state.set(callback(...args)))
    }
    return state
}

/**
 * Connect to a signal and limit the connections lifetime to an object.
 * @param lifetime The object to limit the lifetime of the connection to.
 * @param object Object to connect to.
 * @param signal Signal name.
 * @param callback The callback to execute on the signal.
 * @returns The disconnect function.
 */
export function hook<T extends GObject.Object>(
    lifetime: GObject.Object, // TODO: support GLib.Cancallable
    object: T,
    signal: string,
    callback: (emitter: T, ...args: any[]) => any,
): () => void {
    // gnome-shell overrides connect_object with a different signature
    if ("connectObject" in GObject.Object.prototype) {
        // @ts-expect-error missing types
        object.connectObject(signal, callback, lifetime)
        // @ts-expect-error missing types
        const id = GObject.signal_handler_find(object, { func: callback })
        return () => object.disconnect(id as number)
    }

    // @ts-expect-error missing types
    const id: number = object.connect_object(
        signal,
        callback,
        lifetime,
        GObject.ConnectFlags.DEFAULT,
    )

    // @ts-expect-error ctor is typed as `Function`
    const t = lifetime.constructor.$gtype as GObject.GType
    if (GObject.signal_lookup("destroy", t)) {
        lifetime.connect("destroy", () => object.disconnect(id))
    }

    return () => object.disconnect(id)
}
