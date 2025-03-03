import GObject from "gi://GObject"
import Gio from "gi://Gio"

const _value = Symbol("state value")
const _transformFn = Symbol("binding transformFn")
const _emitter = Symbol("binding emitter")
const _prop = Symbol("binding prop")

const kebabify = (str: string) => str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()

class StateObject<T extends object> extends GObject.Object {
    static {
        GObject.registerClass({
            Properties: {
                value: GObject.ParamSpec.jsobject("value", "", "", GObject.ParamFlags.READWRITE),
            },
        }, this)
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

    private _call<R = T>(transform?: (value: T) => R): Binding<R> {
        const b = Binding.bind(this[_value], "value").as(({ $ }) => $)
        return transform ? b.as(transform) : b as unknown as Binding<R>
    }

    get() { return this.value }
    set(value: T) { return this.value = value }

    get value(): T {
        return this[_value].value.$
    }

    set value(v: T) {
        if (v !== this[_value].value.$) {
            this[_value].value = { $: v }
        }
    }

    subscribe(callback: (value: T) => void): () => void
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(
        objOrCallback: GObject.Object | ((value: T) => void),
        callback?: (value: T) => void,
    ) {
        if (typeof objOrCallback === "function") {
            const id = this[_value].connect("notify::value", ({ value }) => objOrCallback(value.$))
            return () => this[_value].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            // https://gitlab.gnome.org/GNOME/gjs/-/blob/master/doc/Overrides.md?ref_type=heads#gobjectobjectconnect_objectname-callback-gobject-flags
            // @ts-expect-error missing types
            const id: number = this[_value].connect_object(
                "notify::value",
                ({ value }: StateObject<{ $: T }>) => callback(value.$),
                objOrCallback,
                GObject.ConnectFlags.DEFAULT,
            )
            return () => this[_value].disconnect(id)
        }
    }

    toString(): string {
        return `State<${typeof this.get()}>`
    }

    [Symbol.toPrimitive]() {
        console.warn("State implicitly converted to a primitive value.")
        return this.toString()
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

    static bind<T>(object: State<T>): Binding<T>

    static bind<
        T extends GObject.Object,
        P extends keyof T,
    >(object: T, property: Extract<P, string>): Binding<T[P]>

    static bind<T>(object: Gio.Settings, property: string): Binding<T>

    static bind<T>(object: GObject.Object | State<T>, property?: string): Binding<T> {
        return object instanceof State ? object() : new Binding(object, property!)
    }

    as<U>(fn: (v: T) => U): Binding<U> {
        const bind = new Binding(this[_emitter], this[_prop])
        bind[_transformFn] = (v: T) => fn(this[_transformFn](v))
        return bind as unknown as Binding<U>
    }

    get(): T {
        const fn = this[_transformFn]
        const obj = this[_emitter]
        const prop = this[_prop]

        if (obj instanceof Gio.Settings) {
            return fn(obj.get_value(prop).deepUnpack())
        }

        const getter = `get_${prop.replaceAll("-", "_")}`

        if (getter in obj && typeof obj[getter] === "function") {
            return fn(obj[getter]())
        }

        if (prop in obj) {
            return fn(obj[prop])
        }

        throw Error(`cannot get "${prop}" on ${obj}`)
    }

    subscribe(callback: (value: T) => void): () => void
    subscribe(object: GObject.Object, callback: (value: T) => void): () => void

    subscribe(
        objOrCallback: GObject.Object | ((value: T) => void),
        callback?: (value: T) => void,
    ) {
        const sig = this[_emitter] instanceof Gio.Settings ? "changed" : "notify"

        if (typeof objOrCallback === "function") {
            const id = this[_emitter].connect(
                `${sig}::${kebabify(this[_prop])}`,
                () => objOrCallback(this.get()),
            )
            return () => this[_emitter].disconnect(id)
        }

        if (objOrCallback instanceof GObject.Object && typeof callback === "function") {
            // @ts-expect-error missing types
            const id: number = this[_emitter].connect_object(
                `${sig}::${kebabify(this[_prop])}`,
                () => callback(this.get()),
                objOrCallback,
                GObject.ConnectFlags.DEFAULT,
            )
            return () => this[_emitter].disconnect(id)
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
        (obj[setter] as (v: any) => void)(value)
    } else {
        Object.assign(obj, { [prop]: value })
    }
}

export function sync<
    O extends GObject.Object,
    P extends keyof O,
>(
    object: O,
    prop: Extract<P, string>,
    binding: Binding<O[P]>,
): () => void {
    set(object, kebabify(prop), binding.get())
    return binding.subscribe(object, value => set(object, kebabify(prop), value))
}

export function derive<
    const Deps extends Array<Binding<any>>,
    Args extends {
        [K in keyof Deps]: Deps[K] extends Binding<infer T> ? T : never
    },
    V = Args,
>(deps: Deps, fn: (...args: Args) => V = (...args) => args as unknown as V) {
    const get = () => fn(...deps.map(d => d.get()) as Args)
    const state = new State(get())

    for (const dep of deps) {
        sync(state[_value], "value", dep.as(() => ({ $: get() })))
    }

    return state
}
