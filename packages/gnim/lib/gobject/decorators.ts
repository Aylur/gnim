import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { createGTypeName, isGObjectCtor, kebabcase, snakecase } from "../util.js"
import { pspecFromGType } from "./gtype.js"
import { getMetadata } from "./reflect.js"

const { defineProperty, fromEntries, entries, is } = globalThis.Object
const priv = Symbol("gobject private")

type TypeParameter<T = unknown> = GObject.GType<T> | { $gtype: GObject.GType<T> }

type SignalOptions = {
    /** @default false */
    default?: boolean
    /** @default SignalFlags.RUN_FIRST */
    flags?: GObject.SignalFlags
    /** @default AccumulatorType.NONE */
    accumulator?: GObject.AccumulatorType
}

type SignalDeclaration = {
    paramtypes: TypeParameter[]
    returntype: TypeParameter
}

type PropertyTypeDeclaration<T = unknown> =
    | ((name: string, flags: GObject.ParamFlags) => GObject.ParamSpec<T>)
    | GObject.ParamSpec<T>
    | TypeParameter<T>

type Meta = {
    properties: Record<
        string,
        {
            declaration: PropertyTypeDeclaration | null
            descriptor?: PropertyDescriptor
        }
    >
    signals: Record<
        string,
        {
            options?: SignalOptions
            declaration?: SignalDeclaration
            descriptor: PropertyDescriptor
        }
    >
}

const metaMap = new WeakMap<GObject.Object, Meta>()

function getMeta(object: GObject.Object) {
    const meta = metaMap.get(object) ?? { properties: {}, signals: {} }
    metaMap.set(object, meta)
    return meta
}

export function property<T>(
    type: PropertyTypeDeclaration<T>,
): (proto: GObject.Object, name: string, value?: TypedPropertyDescriptor<T>) => void

export function property<T>(
    proto: GObject.Object,
    name: string,
    value?: TypedPropertyDescriptor<T>,
): void

export function property(
    first: GObject.Object | PropertyTypeDeclaration<unknown>,
    name?: string,
    descriptor?: PropertyDescriptor,
) {
    if (typeof name === "string") {
        return void (getMeta(first as GObject.Object).properties[name] = {
            declaration: null,
            descriptor,
        })
    }

    return function (proto: GObject.Object, name: string, descriptor?: PropertyDescriptor) {
        getMeta(proto).properties[name] = {
            declaration: first as PropertyTypeDeclaration,
            descriptor,
        }
    }
}

type ParamType<P> = P extends { $gtype: GObject.GType<infer T> }
    ? T
    : P extends GObject.GType<infer T>
      ? T
      : never

type ParamTypes<Params> = {
    [K in keyof Params]: ParamType<Params[K]>
}

type FunctionParam<Params extends TypeParameter[], Return> = (
    ...args: ParamTypes<Params>
) => ParamType<Return>

export function signal(
    options: SignalOptions,
): (
    proto: GObject.Object,
    name: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
) => void

export function signal<
    const Params extends TypeParameter[],
    const Return extends TypeParameter = typeof GObject.VoidType,
>(
    paramtypes: Params,
    returntype?: Return,
    options?: SignalOptions,
): (
    proto: GObject.Object,
    name: string,
    descriptor: TypedPropertyDescriptor<FunctionParam<Params, Return>>,
) => void

export function signal(
    proto: GObject.Object,
    name: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
): void

export function signal(
    first: GObject.Object | TypeParameter[] | SignalOptions,
    second?: string | TypeParameter,
    third?: PropertyDescriptor | SignalOptions,
) {
    if (typeof second === "string") {
        return void (getMeta(first as GObject.Object).signals[second] = {
            descriptor: third as PropertyDescriptor,
        })
    }

    if (Array.isArray(first)) {
        return function (proto: GObject.Object, name: string, descriptor: PropertyDescriptor) {
            getMeta(proto).signals[name] = {
                descriptor,
                options: third as SignalOptions,
                declaration: {
                    paramtypes: first,
                    returntype: (second as TypeParameter) ?? GObject.VoidType,
                },
            }
        }
    }

    return function (proto: GObject.Object, name: string, descriptor: PropertyDescriptor) {
        getMeta(proto).signals[name] = {
            descriptor,
            options: first as SignalOptions,
        }
    }
}

export type RegisterOptions = {
    GTypeName?: string
    GTypeFlags?: GObject.TypeFlags
    Requires?: Array<{ $gtype: GObject.GType }>
    Implements?: Array<{ readonly $gtype: GObject.GType }>
    CssName?: string
    Template?: string | GLib.Bytes | Uint8Array
    Children?: string[]
    InternalChildren?: string[]
}

type ObjectConstructor = abstract new (...args: any[]) => GObject.Object

export function register<T extends ObjectConstructor>(
    options?: RegisterOptions,
): (constructor: T) => T

export function register<T extends ObjectConstructor>(constructor: T): T

export function register<T extends ObjectConstructor>(
    first?: ObjectConstructor | RegisterOptions,
): T | ((constructor: T) => T) {
    if (first && isGObjectCtor(first)) {
        return registerClass(first, {}) as T
    }

    return function (constructor: ObjectConstructor) {
        return registerClass(constructor, first as RegisterOptions) as T
    }
}

function registerClass(constructor: ObjectConstructor, options: RegisterOptions = {}) {
    const proto = constructor.prototype
    const meta = getMeta(proto)

    const properties = entries(meta.properties).map(([key, { declaration, descriptor }]) => {
        const name = kebabcase(key)
        const readable = !descriptor || typeof descriptor.get === "function"
        const writable = !descriptor || typeof descriptor.set === "function"
        const flags =
            (readable ? GObject.ParamFlags.READABLE : 0) +
            (writable ? GObject.ParamFlags.WRITABLE : 0)
        const type = declaration || getMetadata(proto, key)?.type
        if (!type) throw Error(`missing property type declaration "${constructor.name}.${key}"`)

        if (!descriptor) {
            defineProperty(proto, key, {
                enumerable: true,
                set(v) {
                    if (!(priv in this)) this[priv] = {}

                    if (!is(this[priv][key], v)) {
                        this[priv][key] = v
                        this.notify(name)
                    }
                },
                get() {
                    return this[priv]?.[key]
                },
            })
        }

        defineProperty(proto, `get_${snakecase(key)}`, {
            value: function () {
                return this[key]
            },
        })

        return [name, pspec(name, flags, type)] as const
    })

    const signals = entries(meta.signals).map(([key, { options, declaration, descriptor }]) => {
        const name = kebabcase(key)
        const returntype = declaration?.returntype || getMetadata(proto, key)?.returntype
        const paramtypes = declaration?.paramtypes || getMetadata(proto, key)?.paramtypes

        if (!returntype)
            throw Error(`missing signal returntype declaration ${constructor.name}.${key}`)

        if (!paramtypes)
            throw Error(`missing signal paramtypes declaration ${constructor.name}.${key}`)

        defineProperty(proto, key, {
            value: function (this: GObject.Object, ...args: unknown[]) {
                return GObject.signal_emit_by_name(this, name, ...args)
            },
        })

        if (options?.default !== false) {
            defineProperty(proto, `on_${snakecase(key)}`, {
                value: descriptor.value,
            })
        }

        const signal = {
            param_types: paramtypes.map((i) => ("$gtype" in i ? i.$gtype : i)),
            return_type: "$gtype" in returntype ? returntype.$gtype : returntype,
            accumulator: options?.accumulator,
            flags: options?.flags,
        }
        return [name, signal] as const
    })

    return GObject.registerClass(
        {
            ...options,
            Properties: fromEntries(properties),
            Signals: fromEntries(signals),
            ...(!options.GTypeName && {
                GTypeName: createGTypeName(constructor.name, import.meta.url),
            }),
        },
        constructor,
    )
}

function pspec(
    name: string,
    flags: GObject.ParamFlags,
    declaration: PropertyTypeDeclaration<unknown>,
) {
    if (declaration instanceof GObject.ParamSpec) return declaration

    if (declaration === Object || declaration === Function || declaration === Array) {
        return GObject.ParamSpec.jsobject(name, "", "", flags)
    }

    if (declaration === String) {
        return GObject.ParamSpec.string(name, "", "", flags, "")
    }

    if (declaration === Number) {
        return GObject.ParamSpec.double(name, "", "", flags, -Number.MAX_VALUE, Number.MAX_VALUE, 0)
    }

    if (declaration === Boolean) {
        return GObject.ParamSpec.boolean(name, "", "", flags, false)
    }

    if ("$gtype" in declaration) {
        return pspecFromGType(declaration.$gtype, name, flags)
    }

    if (typeof declaration === "function") {
        return declaration(name, flags)
    }

    throw Error("invalid PropertyTypeDeclaration")
}
