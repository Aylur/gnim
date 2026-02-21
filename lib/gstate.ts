import GObject from "gi://GObject?version=2.0"
import { Accessor, createComputed } from "./state.js"
import { connect, disconnect, kebabcase, type Keyof } from "./util.js"
import { Scope } from "./scope.js"

type Callback = () => void
type DisposeFn = () => void
type PropKey<P> = Exclude<Extract<P, string>, "$signals">

const noop = () => {}

/**
 * Create an {@link Accessor} on a {@link GObject.Object}'s registered property.
 *
 * @param object The {@link GObject.Object} to create the {@link Accessor} on.
 * @param property One of its registered properties.
 */
export function createBinding<T extends GObject.Object, P extends keyof T>(
    object: T,
    property: PropKey<P>,
): Accessor<T[P]>

export function createBinding<
    T extends GObject.Object,
    P1 extends keyof T,
    P2 extends keyof NonNullable<T[P1]>,
>(
    object: T,
    property1: PropKey<P1>,
    property2: PropKey<P2>,
): Accessor<null extends T[P1] ? NonNullable<T[P1]>[P2] | null : NonNullable<T[P1]>[P2]>

export function createBinding<
    T extends GObject.Object,
    P1 extends keyof T,
    P2 extends keyof NonNullable<T[P1]>,
    P3 extends keyof NonNullable<NonNullable<T[P1]>[P2]>,
>(
    object: T,
    property1: PropKey<P1>,
    property2: PropKey<P2>,
    property3: PropKey<P3>,
): Accessor<
    null extends T[P1]
        ? NonNullable<NonNullable<T[P1]>[P2]>[P3] | null
        : null extends NonNullable<T[P1]>[P2]
          ? NonNullable<NonNullable<T[P1]>[P2]>[P3] | null
          : NonNullable<NonNullable<T[P1]>[P2]>[P3]
>

export function createBinding<
    T extends GObject.Object,
    P1 extends keyof T,
    P2 extends keyof NonNullable<T[P1]>,
    P3 extends keyof NonNullable<NonNullable<T[P1]>[P2]>,
    P4 extends keyof NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>,
>(
    object: T,
    property1: PropKey<P1>,
    property2: PropKey<P2>,
    property3: PropKey<P3>,
    property4: PropKey<P4>,
): Accessor<
    null extends T[P1]
        ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
        : null extends NonNullable<T[P1]>[P2]
          ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
          : null extends NonNullable<NonNullable<T[P1]>[P2]>[P3]
            ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
            : NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4]
>

export function createBinding<T>(
    object: GObject.Object,
    key: string,
    ...props: string[]
): Accessor<T> {
    if (props.length === 0) {
        const prop = kebabcase(key) as keyof typeof object

        function subscribe(callback: Callback): DisposeFn {
            const id = connect(object, `notify::${prop}`, () => callback())
            return () => disconnect(object, id)
        }

        function get(): T {
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

    return createComputed(() => {
        let v = createBinding(object as any, key)()
        for (const prop of props) {
            if (prop) v = v !== null ? createBinding(v, prop)() : null
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
    T,
> = SignalsOf<O>[S] extends (...args: any[]) => infer R
    ? void extends R
        ? (...args: [...Parameters<SignalsOf<O>[S]>, prev: NoInfer<T>]) => T
        : never
    : never

export function createConnection<T, O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: ConnectionCallback<O, S, T>,
): Accessor<undefined | T>

export function createConnection<T, O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: ConnectionCallback<O, S, T>,
    init: T,
): Accessor<T>

export function createConnection<T, O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: (...args: any[]) => T,
    init?: T,
): Accessor<T> {
    let value = init
    let id: number

    const observers = new Set<Callback>()

    function subscribe(callback: Callback): DisposeFn {
        if (observers.size === 0) {
            id = connect(object, signal, (_, ...args) => {
                value = handler(...args, value)
                Array.from(observers).forEach((cb) => cb())
            })
        }

        observers.add(callback)

        return () => {
            observers.delete(callback)
            if (observers.size === 0) {
                disconnect(object, id)
            }
        }
    }

    if (Scope.current) {
        const dispose = subscribe(noop)
        Scope.current.onCleanup(dispose)
    }

    function get(): T {
        return value as T
    }

    return new Accessor(get, subscribe)
}
