import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { emit, isGObjectCtor, kebabcase, snakecase } from "../util.js"
import { decoratorMetadata } from "./reflect.js"

const { defineProperty, fromEntries, entries, is } = globalThis.Object
const priv = Symbol("gobject private")

export const { Object } = GObject
export type Object = GObject.Object

export namespace Object {
    export type SignalSignatures = GObject.Object.SignalSignatures
    export type ReadableProperties = GObject.Object.ReadableProperties
    export type WritableProperties = GObject.Object.WritableProperties
    export type ConstructOnlyProperties = GObject.Object.ConstructOnlyProperties
}

export const { SignalFlags } = GObject
export type SignalFlags = GObject.SignalFlags

export const { AccumulatorType } = GObject
export type AccumulatorType = GObject.AccumulatorType

export const { ParamSpec } = GObject
export type ParamSpec<T = unknown> = GObject.ParamSpec<T>

export const { ParamFlags } = GObject
export type ParamFlags = GObject.ParamFlags

export type GType<T = unknown> = GObject.GType<T>

type TypeParameter<T = unknown> = GType<T> | { $gtype: GType<T> }

type SignalOptions = {
    /** @default false */
    default?: boolean
    /** @default SignalFlags.RUN_FIRST */
    flags?: SignalFlags
    /** @default AccumulatorType.NONE */
    accumulator?: AccumulatorType
}

type SignalDeclaration = {
    paramtypes: TypeParameter[]
    returntype: TypeParameter
}

type PropertyTypeDeclaration<T = unknown> =
    | ((name: string, flags: ParamFlags) => ParamSpec<T>)
    | ParamSpec<T>
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

const metaMap = new WeakMap<Object, Meta>()

function getMeta(object: Object) {
    const meta = metaMap.get(object) ?? { properties: {}, signals: {} }
    metaMap.set(object, meta)
    return meta
}

export function property<T>(
    type: PropertyTypeDeclaration<T>,
): (proto: Object, name: string, value?: TypedPropertyDescriptor<T>) => void

export function property<T>(proto: Object, name: string, value?: TypedPropertyDescriptor<T>): void

export function property(
    first: Object | PropertyTypeDeclaration<unknown>,
    name?: string,
    descriptor?: PropertyDescriptor,
) {
    if (typeof name === "string") {
        return void (getMeta(first as Object).properties[name] = {
            declaration: null,
            descriptor,
        })
    }

    return function (proto: Object, name: string, descriptor?: PropertyDescriptor) {
        getMeta(proto).properties[name] = {
            declaration: first as PropertyTypeDeclaration,
            descriptor,
        }
    }
}

type ParamType<P> = P extends { $gtype: GType<infer T> } ? T : P extends GType<infer T> ? T : never

type ParamTypes<Params> = {
    [K in keyof Params]: ParamType<Params[K]>
}

type FunctionParam<Params extends TypeParameter[], Return> = (
    ...args: ParamTypes<Params>
) => ParamType<Return>

export function signal(
    options: SignalOptions,
): (
    proto: Object,
    name: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
) => void

export function signal<
    Params extends TypeParameter[],
    Return extends TypeParameter = typeof GObject.VoidType,
>(
    paramtypes: Params,
    returntype?: Return,
    options?: SignalOptions,
): (
    proto: Object,
    name: string,
    descriptor: TypedPropertyDescriptor<FunctionParam<Params, Return>>,
) => void

export function signal(
    proto: Object,
    name: string,
    descriptor: TypedPropertyDescriptor<(...args: any[]) => any>,
): void

export function signal(
    first: Object | TypeParameter[] | SignalOptions,
    second?: string | TypeParameter,
    third?: PropertyDescriptor | SignalOptions,
) {
    if (typeof second === "string") {
        return void (getMeta(first as Object).signals[second] = {
            descriptor: third as PropertyDescriptor,
        })
    }

    if (Array.isArray(first)) {
        return function (proto: Object, name: string, descriptor: PropertyDescriptor) {
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

    return function (proto: Object, name: string, descriptor: PropertyDescriptor) {
        getMeta(proto).signals[name] = {
            descriptor,
            options: first as SignalOptions,
        }
    }
}

export type RegisterOptions = {
    GTypeName?: string
    GTypeFlags?: GObject.TypeFlags
    Requires?: Array<{ $gtype: GType }>
    Implements?: Array<{ readonly $gtype: GType }>
    CssName?: string
    Template?: string | GLib.Bytes | Uint8Array
    Children?: string[]
    InternalChildren?: string[]
}

type ObjectConstructor = {
    new (...args: any[]): Object
}

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
    const design = decoratorMetadata.get(proto)

    const properties = entries(meta.properties).map(([key, { declaration, descriptor }]) => {
        const name = kebabcase(key)
        const readable = !descriptor || "get" in descriptor
        const writeable = !descriptor || "set" in descriptor
        const flags = (readable ? ParamFlags.READABLE : 0) + (writeable ? ParamFlags.WRITABLE : 0)
        const type = declaration || design?.[key].type
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
        const returntype = declaration?.returntype || design?.[key].returntype
        const paramtypes = declaration?.paramtypes || design?.[key].paramtypes

        if (!returntype)
            throw Error(`missing signal returntype declaration ${constructor.name}.${key}`)

        if (!paramtypes)
            throw Error(`missing signal paramtypes declaration ${constructor.name}.${key}`)

        defineProperty(proto, key, {
            value: function (this: Object, ...args: unknown[]) {
                return emit(this, name, ...args)
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
        },
        constructor,
    )
}

const MININT8 = GLib.MININT8
const MAXINT8 = GLib.MAXINT8
const MAXUINT8 = GLib.MAXUINT8

const MAXINT32 = GLib.MAXINT32
const MININT32 = GLib.MININT32
const MAXUINT32 = GLib.MAXUINT32

const MININT64 = GLib.MININT64_BIGINT as unknown as number
const MAXINT64 = GLib.MAXINT64_BIGINT as unknown as number
const MAXUINT64 = GLib.MAXUINT64_BIGINT as unknown as number

const MINLONG = Number.MIN_SAFE_INTEGER
const MAXLONG = Number.MAX_SAFE_INTEGER
const MAXULONG = Number.MAX_SAFE_INTEGER

const MAXFLOAT = 3.4028234663852886e38
const MAXDOUBLE = Number.MAX_VALUE

function pspecFromGType(type: GType<unknown>, name: string, flags: ParamFlags) {
    switch (type) {
        case GObject.TYPE_CHAR:
            return GObject.param_spec_char(name, null, null, MININT8, MAXINT8, 0, flags)
        case GObject.TYPE_UCHAR:
            return GObject.param_spec_uchar(name, null, null, 0, MAXUINT8, 0, flags)
        case GObject.TYPE_INT:
            return GObject.param_spec_int(name, null, null, MININT32, MAXINT32, 0, flags)
        case GObject.TYPE_UINT:
            return GObject.param_spec_uint(name, null, null, 0, MAXUINT32, 0, flags)
        case GObject.TYPE_LONG:
            return GObject.param_spec_long(name, null, null, MINLONG, MAXLONG, 0, flags)
        case GObject.TYPE_ULONG:
            return GObject.param_spec_ulong(name, null, null, 0, MAXULONG, 0, flags)
        case GObject.TYPE_INT64:
            return GObject.param_spec_int64(name, null, null, MININT64, MAXINT64, 0, flags)
        case GObject.TYPE_UINT64:
            return GObject.param_spec_uint64(name, null, null, 0, MAXUINT64, 0, flags)
        case GObject.TYPE_FLOAT:
            return GObject.param_spec_float(name, null, null, -MAXFLOAT, MAXFLOAT, 0, flags)
        case GObject.TYPE_DOUBLE:
            return GObject.param_spec_double(name, null, null, -MAXDOUBLE, MAXDOUBLE, 0, flags)
        case GObject.TYPE_BOOLEAN:
            return GObject.param_spec_boolean(name, null, null, false, flags)
        case GObject.TYPE_STRING:
            return GObject.param_spec_string(name, null, null, "", flags)
        case GObject.TYPE_JSOBJECT:
            return GObject.param_spec_boxed(name, null, null, GObject.TYPE_JSOBJECT, flags)
        default:
            if (GObject.type_is_a(type, GObject.TYPE_OBJECT)) {
                return GObject.param_spec_object(name, null, null, type, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_GTYPE)) {
                return GObject.param_spec_gtype(name, null, null, type, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_BOXED)) {
                return GObject.param_spec_boxed(name, null, null, type, flags)
            }
            throw Error(`cannot guess ParamSpec from GObject.ype "${type}"`)
    }
}

function pspec(name: string, flags: ParamFlags, declaration: PropertyTypeDeclaration<unknown>) {
    if (declaration instanceof ParamSpec) return declaration

    if (declaration === Object || declaration === Function || declaration === Array) {
        return ParamSpec.jsobject(name, "", "", flags)
    }

    if (declaration === String) {
        return ParamSpec.string(name, "", "", flags, "")
    }

    if (declaration === Number) {
        return ParamSpec.double(name, "", "", flags, -Number.MAX_VALUE, Number.MAX_VALUE, 0)
    }

    if (declaration === Boolean) {
        return ParamSpec.boolean(name, "", "", flags, false)
    }

    if ("$gtype" in declaration) {
        return pspecFromGType(declaration.$gtype, name, flags)
    }

    if (typeof declaration === "function") {
        return declaration(name, flags)
    }

    throw Error("invalid PropertyTypeDeclaration")
}

/**
 * @experimental
 * Asserts a gtype in cases where the type is too loose/strict.
 *
 * @example
 * ```ts
 * type Tuple = [number, number]
 * const Tuple = gtype<Tuple>(Array)
 *
 * class {
 *   \@property(Tuple) value: Tuple = [1, 2]
 * }
 * ```
 */
export function gtype<Assert>(type: GType<any> | { $gtype: GType<any> }): {
    $gtype: GType<Assert>
} {
    return "$gtype" in type ? type : { $gtype: type }
}

declare global {
    interface FunctionConstructor {
        $gtype: GType<(...args: any[]) => any>
    }

    interface ArrayConstructor {
        $gtype: GType<any[]>
    }

    interface DateConstructor {
        $gtype: GType<Date>
    }

    interface MapConstructor {
        $gtype: GType<Map<any, any>>
    }

    interface SetConstructor {
        $gtype: GType<Set<any>>
    }
}

Function.$gtype = GObject.TYPE_JSOBJECT as FunctionConstructor["$gtype"]
Array.$gtype = GObject.TYPE_JSOBJECT as ArrayConstructor["$gtype"]
Date.$gtype = GObject.TYPE_JSOBJECT as DateConstructor["$gtype"]
Map.$gtype = GObject.TYPE_JSOBJECT as MapConstructor["$gtype"]
Set.$gtype = GObject.TYPE_JSOBJECT as SetConstructor["$gtype"]

export const {
    VoidType,
    Char,
    UChar,
    Boolean,
    Int,
    UInt,
    Long,
    ULong,
    Int64,
    UInt64,
    Float,
    Double,
    String,
    JSObject,
    Type,
} = GObject
