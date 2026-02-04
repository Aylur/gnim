/**
 * In the future I would like to make type declaration in decorators optional
 * and infer it from typescript types at transpile time. Currently, we could
 * either use stage 2 decorators with the "emitDecoratorMetadata" and
 * "experimentalDecorators" tsconfig options. However, metadata is not supported
 * by esbuild which is what I'm mostly targeting as the bundler for performance
 * reasons. https://github.com/evanw/esbuild/issues/257
 * However, I believe that we should not use stage 2 anymore,
 * so I'm waiting for a better alternative.
 */

import G from "gi://GObject?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { definePropertyGetter, kebabify } from "./util.js"

const priv = Symbol("gobject private")
const { defineProperty, fromEntries, entries } = globalThis.Object

export { G as default }

export const Object = G.Object
export type Object = G.Object

export const SignalFlags = G.SignalFlags
export type SignalFlags = G.SignalFlags

export const AccumulatorType = G.AccumulatorType
export type AccumulatorType = G.AccumulatorType

export type ParamSpec<T = unknown> = G.ParamSpec<T>
export const ParamSpec = G.ParamSpec

export type ParamFlags = G.ParamFlags
export const ParamFlags = G.ParamFlags

export type GType<T = unknown> = G.GType<T>

interface GPrivate extends G.Object {
    [priv]: Record<string, any>
}

type Meta = {
    properties?: {
        [fieldName: string]: {
            flags: ParamFlags
            type: PropertyTypeDeclaration<unknown>
        }
    }
    signals?: {
        [key: string]: {
            default?: boolean
            flags?: SignalFlags
            accumulator?: AccumulatorType
            return_type?: GType
            param_types?: Array<GType>
            method: (...arg: any[]) => unknown
        }
    }
}

type Context = { private: false; static: false; name: string }
type PropertyContext<T> = ClassFieldDecoratorContext<G.Object, T> & Context
type GetterContext<T> = ClassGetterDecoratorContext<G.Object, T> & Context
type SetterContext<T> = ClassSetterDecoratorContext<G.Object, T> & Context
type SignalContext<T extends () => any> = ClassMethodDecoratorContext<G.Object, T> & Context

type SignalOptions = {
    default?: boolean
    flags?: SignalFlags
    accumulator?: AccumulatorType
}

type PropertyTypeDeclaration<T> =
    | ((name: string, flags: ParamFlags) => ParamSpec<T>)
    | ParamSpec<T>
    | { $gtype: GType<T> }

function assertField(
    ctx: ClassFieldDecoratorContext | ClassGetterDecoratorContext | ClassSetterDecoratorContext,
): string {
    if (ctx.private) throw Error("private fields are not supported")
    if (ctx.static) throw Error("static fields are not supported")

    if (typeof ctx.name !== "string") {
        throw Error("only strings can be gobject property keys")
    }

    return ctx.name
}

/**
 * Defines a readable *and* writeable property to be registered when using the {@link register} decorator.
 *
 * Example:
 * ```ts
 * class {
 *     \@property(String) myProp = ""
 * }
 * ```
 */
export function property<T>(typeDeclaration: PropertyTypeDeclaration<T>) {
    return function (
        _: void,
        ctx: PropertyContext<T>,
        options?: { metaOnly: true },
    ): (this: G.Object, init: T) => any {
        const fieldName = assertField(ctx)
        const key = kebabify(fieldName)
        const meta: Partial<Meta> = ctx.metadata!

        meta.properties ??= {}
        meta.properties[fieldName] = { flags: ParamFlags.READWRITE, type: typeDeclaration }

        ctx.addInitializer(function () {
            definePropertyGetter(this, fieldName as keyof G.Object)

            if (options && options.metaOnly) return

            defineProperty(this, fieldName, {
                enumerable: true,
                configurable: false,
                set(v: T) {
                    if (this[priv][key] !== v) {
                        this[priv][key] = v
                        this.notify(key)
                    }
                },
                get(): T {
                    return this[priv][key]
                },
            } satisfies ThisType<GPrivate>)
        })

        return function (init: T) {
            const dict = ((this as GPrivate)[priv] ??= {})
            dict[key] = init
            return init
        }
    }
}

/**
 * Defines a read-only property to be registered when using the {@link register} decorator.
 * If the getter has a setter pair decorated with the {@link setter} decorator the property will be readable *and* writeable.
 *
 * Example:
 * ```ts
 * class {
 *     \@setter(String)
 *     set myProp(value: string) {
 *         //
 *     }
 *
 *     \@getter(String)
 *     get myProp(): string {
 *         return ""
 *     }
 * }
 * ```
 */
export function getter<T>(typeDeclaration: PropertyTypeDeclaration<T>) {
    return function (get: (this: G.Object) => any, ctx: GetterContext<T>) {
        const fieldName = assertField(ctx)
        const meta: Partial<Meta> = ctx.metadata!
        const props = (meta.properties ??= {})
        if (fieldName in props) {
            const { flags, type } = props[fieldName]
            props[fieldName] = { flags: flags | ParamFlags.READABLE, type }
        } else {
            props[fieldName] = { flags: ParamFlags.READABLE, type: typeDeclaration }
        }
        return get
    }
}

/**
 * Defines a write-only property to be registered when using the {@link register} decorator.
 * If the setter has a getter pair decorated with the {@link getter} decorator the property will be writeable *and* readable.
 *
 * Example:
 * ```ts
 * class {
 *     \@setter(String)
 *     set myProp(value: string) {
 *         //
 *     }
 *
 *     \@getter(String)
 *     get myProp(): string {
 *         return ""
 *     }
 * }
 * ```
 */
export function setter<T>(typeDeclaration: PropertyTypeDeclaration<T>) {
    return function (set: (this: G.Object, value: any) => void, ctx: SetterContext<T>) {
        const fieldName = assertField(ctx)
        const meta: Partial<Meta> = ctx.metadata!
        const props = (meta.properties ??= {})
        if (fieldName in props) {
            const { flags, type } = props[fieldName]
            props[fieldName] = { flags: flags | ParamFlags.WRITABLE, type }
        } else {
            props[fieldName] = { flags: ParamFlags.WRITABLE, type: typeDeclaration }
        }
        return set
    }
}

type ParamType<P> = P extends { $gtype: GType<infer T> } ? T : P extends GType<infer T> ? T : never

type ParamTypes<Params> = {
    [K in keyof Params]: ParamType<Params[K]>
}

/**
 * Defines a signal to be registered when using the {@link register} decorator.
 *
 * Example:
 * ```ts
 * class {
 *     \@signal([String, Number], Boolean, {
 *         accumulator: AccumulatorType.FIRST_WINS
 *     })
 *     mySignal(str: string, n: number): boolean {
 *         // default handler
 *         return false
 *     }
 * }
 * ```
 */
export function signal<
    const Params extends Array<{ $gtype: GType } | GType>,
    Return extends { $gtype: GType } | GType,
>(
    params: Params,
    returnType: Return,
    options?: SignalOptions,
): (
    method: (this: G.Object, ...args: any) => ParamType<Return>,
    ctx: SignalContext<typeof method>,
) => (this: G.Object, ...args: ParamTypes<Params>) => any

/**
 * Defines a signal to be registered when using the {@link register} decorator.
 *
 * Example:
 * ```ts
 * class {
 *     \@signal(String, Number)
 *     mySignal(str: string, n: number): void {
 *         // default handler
 *     }
 * }
 * ```
 */
export function signal<Params extends Array<{ $gtype: GType } | GType>>(
    ...params: Params
): (
    method: (this: G.Object, ...args: any) => void,
    ctx: SignalContext<typeof method>,
) => (this: G.Object, ...args: ParamTypes<Params>) => void

export function signal<
    Params extends Array<{ $gtype: GType } | GType>,
    Return extends { $gtype: GType } | GType,
>(
    ...args: Params | [params: Params, returnType?: Return, options?: SignalOptions]
): (
    method: (this: G.Object, ...args: ParamTypes<Params>) => ParamType<Return> | void,
    ctx: SignalContext<typeof method>,
) => typeof method {
    return function (method, ctx) {
        if (ctx.private) throw Error("private fields are not supported")
        if (ctx.static) throw Error("static fields are not supported")

        if (typeof ctx.name !== "string") {
            throw Error("only strings can be gobject signals")
        }

        const signalName = kebabify(ctx.name)
        const meta: Partial<Meta> = ctx.metadata!
        const signals = (meta.signals ??= {})

        if (Array.isArray(args[0])) {
            const [params, returnType, options] = args as [
                params: Params,
                returnType?: Return,
                options?: SignalOptions,
            ]

            signals[signalName] = {
                method,
                default: options?.default ?? true,
                param_types: params.map((i) => ("$gtype" in i ? i.$gtype : i)),
                ...(returnType && {
                    return_type: "$gtype" in returnType ? returnType.$gtype : returnType,
                }),
                ...(options?.flags && {
                    flags: options.flags,
                }),
                ...(typeof options?.accumulator === "number" && {
                    accumulator: options.accumulator,
                }),
            }
        } else {
            const params = args as Params
            signals[signalName] = {
                method,
                default: true,
                param_types: params.map((i) => ("$gtype" in i ? i.$gtype : i)),
            }
        }

        return function (...params) {
            return this.emit(
                // @ts-expect-error its a valid signal
                signalName,
                ...params,
            ) as ParamType<Return>
        }
    }
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
        case G.TYPE_CHAR:
            return G.param_spec_char(name, null, null, MININT8, MAXINT8, 0, flags)
        case G.TYPE_UCHAR:
            return G.param_spec_uchar(name, null, null, 0, MAXUINT8, 0, flags)
        case G.TYPE_INT:
            return G.param_spec_int(name, null, null, MININT32, MAXINT32, 0, flags)
        case G.TYPE_UINT:
            return G.param_spec_uint(name, null, null, 0, MAXUINT32, 0, flags)
        case G.TYPE_LONG:
            return G.param_spec_long(name, null, null, MINLONG, MAXLONG, 0, flags)
        case G.TYPE_ULONG:
            return G.param_spec_ulong(name, null, null, 0, MAXULONG, 0, flags)
        case G.TYPE_INT64:
            return G.param_spec_int64(name, null, null, MININT64, MAXINT64, 0, flags)
        case G.TYPE_UINT64:
            return G.param_spec_uint64(name, null, null, 0, MAXUINT64, 0, flags)
        case G.TYPE_FLOAT:
            return G.param_spec_float(name, null, null, -MAXFLOAT, MAXFLOAT, 0, flags)
        case G.TYPE_DOUBLE:
            return G.param_spec_double(name, null, null, -MAXDOUBLE, MAXDOUBLE, 0, flags)
        case G.TYPE_BOOLEAN:
            return G.param_spec_boolean(name, null, null, false, flags)
        case G.TYPE_STRING:
            return G.param_spec_string(name, null, null, "", flags)
        case G.TYPE_JSOBJECT:
            return G.param_spec_boxed(name, null, null, G.TYPE_JSOBJECT, flags)
        default:
            if (G.type_is_a(type, G.TYPE_OBJECT)) {
                return G.param_spec_object(name, null, null, type, flags)
            }
            if (G.type_is_a(type, G.TYPE_GTYPE)) {
                return G.param_spec_gtype(name, null, null, type, flags)
            }
            if (G.type_is_a(type, G.TYPE_BOXED)) {
                return G.param_spec_boxed(name, null, null, type, flags)
            }
            throw Error(`cannot guess ParamSpec from GType "${type}"`)
    }
}

function pspec(name: string, flags: ParamFlags, declaration: PropertyTypeDeclaration<unknown>) {
    if (declaration instanceof ParamSpec) return declaration

    if ("$gtype" in declaration) {
        return pspecFromGType(declaration.$gtype, name, flags)
    }

    if (typeof declaration === "function") {
        return declaration(name, flags)
    }

    throw Error("invalid PropertyTypeDeclaration")
}

type MetaInfo = {
    GTypeName?: string
    GTypeFlags?: G.TypeFlags
    Requires?: Array<{ $gtype: GType }>
    Implements?: Array<{ $gtype: GType }>
    CssName?: string
    Template?: string | GLib.Bytes | Uint8Array
    Children?: string[]
    InternalChildren?: string[]
}

/**
 * Replacement for {@link G.registerClass}
 * This decorator consumes metadata needed to register types where the provided decorators are used:
 * - {@link signal}
 * - {@link property}
 * - {@link getter}
 * - {@link setter}
 *
 * Example:
 * ```ts
 * \@register({ GTypeName: "MyClass" })
 * class MyClass extends GObject.Object { }
 * ```
 */
export function register<Cls extends { new (...args: any): G.Object }>(options: MetaInfo = {}) {
    return function (cls: Cls, ctx: ClassDecoratorContext<Cls>) {
        const t = options.Template

        if (typeof t === "string" && !t.startsWith("resource://") && !t.startsWith("file://")) {
            options.Template = new TextEncoder().encode(t)
        }

        const meta = ctx.metadata! as Meta

        const props: Record<string, ParamSpec<unknown>> = fromEntries(
            entries(meta.properties ?? {}).map(([fieldName, { flags, type }]) => {
                const key = kebabify(fieldName)
                const spec = pspec(key, flags, type)
                return [key, spec]
            }),
        )

        const signals = fromEntries(
            entries(meta.signals ?? {}).map(([signalName, { default: def, method, ...signal }]) => {
                if (def) {
                    defineProperty(cls.prototype, `on_${signalName.replaceAll("-", "_")}`, {
                        enumerable: false,
                        configurable: false,
                        value: method,
                    })
                }
                return [signalName, signal]
            }),
        )

        delete meta.properties
        delete meta.signals

        G.registerClass({ ...options, Properties: props, Signals: signals }, cls)
    }
}

/**
 * @experimental
 * Asserts a gtype in cases where the type is too loose/strict.
 *
 * Example:
 * ```ts
 * type Tuple = [number, number]
 * const Tuple = gtype<Tuple>(Array)
 *
 * class {
 *   \@property(Tuple) value = [1, 2] as Tuple
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

Function.$gtype = G.TYPE_JSOBJECT as FunctionConstructor["$gtype"]
Array.$gtype = G.TYPE_JSOBJECT as ArrayConstructor["$gtype"]
Date.$gtype = G.TYPE_JSOBJECT as DateConstructor["$gtype"]
Map.$gtype = G.TYPE_JSOBJECT as MapConstructor["$gtype"]
Set.$gtype = G.TYPE_JSOBJECT as SetConstructor["$gtype"]
