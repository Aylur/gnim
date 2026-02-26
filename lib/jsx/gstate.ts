import GObject from "gi://GObject?version=2.0"
import { onCleanup } from "./scope.js"
import { Accessor, createComputed } from "./state.js"
import { connect, disconnect, kebabcase, type Keyof } from "../util.js"

type Callback = () => void
type DisposeFn = () => void
type PropKeyOf<O> = Exclude<
    Keyof<O>,
    "$signals" | "$readableProperties" | "$writableProperties" | "$constructOnlyProperties"
>

/**
 * Reactively reference a {@link GObject.Object}'s registered property.
 *
 * @param object The {@link GObject.Object} to create the {@link Accessor} on.
 * @param property One of its registered properties.
 * @returns Accessor which references the property value
 */
export function ref<T extends GObject.Object, P extends PropKeyOf<T>>(
    object: T,
    property: P,
): Accessor<T[P]>

export function ref<
    T extends GObject.Object,
    P1 extends PropKeyOf<T>,
    P2 extends PropKeyOf<NonNullable<T[P1]>>,
>(
    object: T,
    property1: P1,
    property2: P2,
): Accessor<null extends T[P1] ? NonNullable<T[P1]>[P2] | null : NonNullable<T[P1]>[P2]>

export function ref<
    T extends GObject.Object,
    P1 extends PropKeyOf<T>,
    P2 extends PropKeyOf<NonNullable<T[P1]>>,
    P3 extends PropKeyOf<NonNullable<NonNullable<T[P1]>[P2]>>,
>(
    object: T,
    property1: P1,
    property2: P2,
    property3: P3,
): Accessor<
    null extends T[P1]
        ? NonNullable<NonNullable<T[P1]>[P2]>[P3] | null
        : null extends NonNullable<T[P1]>[P2]
          ? NonNullable<NonNullable<T[P1]>[P2]>[P3] | null
          : NonNullable<NonNullable<T[P1]>[P2]>[P3]
>

export function ref<
    T extends GObject.Object,
    P1 extends PropKeyOf<T>,
    P2 extends PropKeyOf<NonNullable<T[P1]>>,
    P3 extends PropKeyOf<NonNullable<NonNullable<T[P1]>[P2]>>,
    P4 extends PropKeyOf<NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>>,
>(
    object: T,
    property1: P1,
    property2: P2,
    property3: P3,
    property4: P4,
): Accessor<
    null extends T[P1]
        ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
        : null extends NonNullable<T[P1]>[P2]
          ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
          : null extends NonNullable<NonNullable<T[P1]>[P2]>[P3]
            ? NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4] | null
            : NonNullable<NonNullable<NonNullable<T[P1]>[P2]>[P3]>[P4]
>

export function ref<T>(object: GObject.Object, key: string, ...props: string[]): Accessor<T> {
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

export function connectEffect<O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: ConnectionCallback<O, S>,
): void {
    const id = connect(object, signal, (_, ...args) => handler(...args))
    onCleanup(() => disconnect(object, id))
}
