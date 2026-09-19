import GObject from "gi://GObject?version=2.0"
import { kebabcase, type Keyof } from "../util.js"
import {
    computed,
    createAccessor,
    isAccessor,
    type Accessor,
    type MaybeAccessor,
} from "./reactive.js"
import { Computed, onCleanup, Signal, type Fn } from "./signal.js"

export type Store<S = Record<string | symbol, unknown>> = S & {
    $readableProperties: S
}

/**
 * Create a store where each field is replaced with a reactive accessor.
 * Plain fields become writable states, getters become memoized {@link computed}
 * values and methods are kept as they are. Reading a field in a reactive scope
 * tracks it, assigning a field notifies its observers.
 *
 * @example
 *
 * ```
 * const myStore = createStore({
 *   value: 0,
 *   get double() {
 *     return this.value * 2
 *   },
 *   nestedStore: createStore({
 *     value: "",
 *   }),
 * })
 * ```
 */
export function createStore<S extends Record<PropertyKey, any>>(store: S): Store<S> {
    const obj = {}
    const properties = Object.entries(Object.getOwnPropertyDescriptors(store))
    const accessors: Record<PropertyKey, () => unknown> = {}

    for (const [key, desc] of properties) {
        if ("value" in desc) {
            const signal = new Signal(desc.value)
            Object.defineProperty(obj, key, {
                get: (accessors[key] = signal.get.bind(signal)),
                set: signal.set.bind(signal),
                enumerable: true,
            })
        } else if ("get" in desc) {
            const computed = new Computed(desc.get!.bind(obj))
            Object.defineProperty(obj, key, {
                get: (accessors[key] = computed.get.bind(computed)),
                set: desc.set,
                enumerable: true,
            })
        } else {
            Object.defineProperty(obj, key, desc)
        }
    }

    return obj as Store<S>
}

type Bindable = GObject.Object | Store

type PropKeys<O> = O extends GObject.Object
    ? [Keyof<O["$readableProperties"]>] extends [never]
        ? Keyof<O>
        : Keyof<O["$readableProperties"]>
    : O extends Store
      ? keyof O["$readableProperties"]
      : never

type Prop<O, K> = O extends GObject.Object
    ? [Keyof<O["$readableProperties"]>] extends [never]
        ? K extends Keyof<O>
            ? O[K]
            : never
        : K extends Keyof<O["$readableProperties"]>
          ? O["$readableProperties"][K]
          : never
    : O extends Store
      ? K extends Keyof<O["$readableProperties"]>
          ? O["$readableProperties"][K]
          : never
      : never

type NProp<O, K> = NonNullable<Prop<O, K>>
// `extends infer T` instantiates the type so hovering shows the result
type ChainProp<Links, V> = V | Extract<Links, null | undefined> extends infer T ? T : never

/**
 * Reactively read a {@link GObject.Object}'s registered property or a {@link Store}'s field.
 *
 * @param object The {@link GObject.Object} or {@link Store} to create the {@link Accessor} on.
 * @param property One of its registered properties or fields.
 * @returns Accessor which references the property value
 */
export function bind<O extends Bindable, P extends PropKeys<O>>(
    object: O,
    property: P,
): Accessor<Prop<O, P>>

export function bind<O extends Bindable, P1 extends PropKeys<O>, P2 extends PropKeys<NProp<O, P1>>>(
    object: O,
    property1: P1,
    property2: P2,
): Accessor<ChainProp<Prop<O, P1>, Prop<NProp<O, P1>, P2>>>

export function bind<
    O extends Bindable,
    P1 extends PropKeys<O>,
    P2 extends PropKeys<NProp<O, P1>>,
    P3 extends PropKeys<NProp<NProp<O, P1>, P2>>,
>(
    object: O,
    property1: P1,
    property2: P2,
    property3: P3,
): Accessor<ChainProp<Prop<O, P1> | Prop<NProp<O, P1>, P2>, Prop<NProp<NProp<O, P1>, P2>, P3>>>

export function bind<
    O extends Bindable,
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
    ChainProp<
        Prop<O, P1> | Prop<NProp<O, P1>, P2> | Prop<NProp<NProp<O, P1>, P2>, P3>,
        Prop<NProp<NProp<NProp<O, P1>, P2>, P3>, P4>
    >
>

export function bind(object: Bindable, key: string | symbol, ...props: string[]): Accessor {
    if (props.length === 0) {
        if (object instanceof GObject.Object && typeof key === "string") {
            const name = kebabcase(key)

            function subscribe(callback: Fn): Fn {
                const id = GObject.signal_connect(object as GObject.Object, `notify::${name}`, () =>
                    callback(),
                )
                return () => GObject.signal_handler_disconnect(object as GObject.Object, id)
            }

            function get() {
                const getter = `get_${name.replaceAll("-", "_")}` as keyof typeof object

                if (getter in object && typeof object[getter] === "function") {
                    return (object[getter] as () => unknown)()
                }

                if (key in object) return object[key as keyof typeof object]
                if (name in object) return object[name as keyof typeof object]

                throw Error(`cannot get property "${key as string}" on "${object}"`)
            }

            return createAccessor(get, subscribe)
        } else {
            return createAccessor(() => (object as any)[key])
        }
    }

    return computed(
        () => {
            let v = bind(object, key)()
            for (const prop of props) {
                if (v === null || v === undefined) break
                v = bind(v as Bindable, prop)()
            }
            return v
        },
        { equals: () => false },
    )
}

type SignalsOf<O> = O extends GObject.Object
    ? {
          [
              S in Keyof<O["$signals"]> as S extends `${infer Name}::{}`
                  ? Name extends "notify"
                      ? never
                      : Name | `${Name}::${string}`
                  : S
          ]: O["$signals"][S]
      } & {
          [S in Keyof<O["$readableProperties"]> as `notify::${S}`]: (
              pspec: GObject.ParamSpec<O["$readableProperties"][S]>,
          ) => void
      } & {
          notify: (pspec: GObject.ParamSpec) => void
      }
    : never

type ConnectionCallback<
    O extends GObject.Object,
    S extends keyof SignalsOf<O>,
> = SignalsOf<O>[S] extends (...args: infer Args) => infer Return
    ? (...args: Args) => Return
    : never

/**
 * Connect a handler to a GObject signal and disconnect it when the current
 * scope is disposed.
 *
 * @throws when called outside of a scope.
 */
export function connectSignal<O extends GObject.Object, S extends Keyof<SignalsOf<O>>>(
    object: O,
    signal: S,
    handler: ConnectionCallback<O, S>,
): void {
    const id = GObject.signal_connect(object, signal, (_, ...args) => handler(...args))
    onCleanup(() => GObject.signal_handler_disconnect(object, id))
}

/**
 * Maps a MaybeAccessor to an Accessor with an optional fallback value.
 *
 * @example
 *
 * ```ts
 * const props: {
 *   optional?: MaybeAccessor<string>
 *   required: MaybeAccessor<string>
 * }
 *
 * const optional: Accessor<string> = prop(props.optional, "")
 * const required: Accessor<string> = prop(props.required)
 * ```
 *
 */
export function prop<T>(value: MaybeAccessor<T>): Accessor<T>

export function prop<T>(value: MaybeAccessor<T>, fallback: NonNullable<T>): Accessor<NonNullable<T>>

export function prop<T>(value: T, fallback?: unknown) {
    return isAccessor(value)
        ? computed(() => value() ?? fallback)
        : createAccessor(() => value ?? fallback)
}
