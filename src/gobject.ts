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

import GObject from "gi://GObject"
import GLib from "gi://GLib"
import { definePropertyGetter, kebabify } from "./util.js"

const priv = Symbol("gobject private")
const { defineProperty, fromEntries, entries } = Object
const { Object: GObj, registerClass } = GObject

export { GObject as default }
export { GObj as Object }

export const SignalFlags = GObject.SignalFlags
export type SignalFlags = GObject.SignalFlags

export const AccumulatorType = GObject.AccumulatorType
export type AccumulatorType = GObject.AccumulatorType

export type ParamSpec<T = unknown> = GObject.ParamSpec<T>
export const ParamSpec = GObject.ParamSpec

export type ParamFlags = GObject.ParamFlags
export const ParamFlags = GObject.ParamFlags

export type GType<T = unknown> = GObject.GType<T>

type GObj = GObject.Object

interface GObjPrivate extends GObj {
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
type PropertyContext<T> = ClassFieldDecoratorContext<GObj, T> & Context
type GetterContext<T> = ClassGetterDecoratorContext<GObj, T> & Context
type SetterContext<T> = ClassSetterDecoratorContext<GObj, T> & Context
type SignalContext<T extends () => any> = ClassMethodDecoratorContext<GObj, T> & Context

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
    ): (this: GObj, init: T) => T {
        const fieldName = assertField(ctx)
        const key = kebabify(fieldName)
        const meta: Partial<Meta> = ctx.metadata!

        meta.properties ??= {}
        meta.properties[fieldName] = { flags: ParamFlags.READWRITE, type: typeDeclaration }

        ctx.addInitializer(function () {
            definePropertyGetter(this, fieldName as Extract<keyof GObj, string>)

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
            } satisfies ThisType<GObjPrivate>)
        })

        return function (init: T) {
            const dict = ((this as GObjPrivate)[priv] ??= {})
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
    return function getter(getter: (this: GObj) => T, ctx: GetterContext<T>): (this: GObj) => T {
        const fieldName = assertField(ctx)
        const meta: Partial<Meta> = ctx.metadata!
        const props = (meta.properties ??= {})
        if (fieldName in props) {
            const { flags, type } = props[fieldName]
            props[fieldName] = { flags: flags | ParamFlags.READABLE, type }
        } else {
            props[fieldName] = { flags: ParamFlags.READABLE, type: typeDeclaration }
        }
        return getter
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
    return function setter(
        setter: (this: GObj, value: T) => void,
        ctx: SetterContext<T>,
    ): (this: GObj, value: T) => void {
        const fieldName = assertField(ctx)
        const meta: Partial<Meta> = ctx.metadata!
        const props = (meta.properties ??= {})
        if (fieldName in props) {
            const { flags, type } = props[fieldName]
            props[fieldName] = { flags: flags | ParamFlags.WRITABLE, type }
        } else {
            props[fieldName] = { flags: ParamFlags.WRITABLE, type: typeDeclaration }
        }
        return setter
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
    returnType?: Return,
    options?: SignalOptions,
): (
    method: (this: GObj, ...args: ParamTypes<Params>) => ParamType<Return>,
    ctx: SignalContext<typeof method>,
) => typeof method

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
    method: (this: GObject.Object, ...args: ParamTypes<Params>) => void,
    ctx: SignalContext<typeof method>,
) => typeof method

export function signal<
    Params extends Array<{ $gtype: GType } | GType>,
    Return extends { $gtype: GType } | GType,
>(
    ...args: Params | [params: Params, returnType?: Return, options?: SignalOptions]
): (
    method: (this: GObj, ...args: ParamTypes<Params>) => ParamType<Return> | void,
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
                param_types: params.map((i) => ("$gtype" in i ? i.$gtype : i)),
            }
        }

        return function (...params) {
            return this.emit(signalName, ...params) as ParamType<Return>
        }
    }
}

const MAXINT = 2 ** 31 - 1
const MININT = -(2 ** 31)
const MAXUINT = 2 ** 32 - 1
const MAXFLOAT = 3.4028235e38
const MINFLOAT = -3.4028235e38
const MININT64 = Number.MIN_SAFE_INTEGER
const MAXINT64 = Number.MAX_SAFE_INTEGER

function pspecFromGType(type: GType<unknown>, name: string, flags: ParamFlags) {
    switch (type) {
        case GObject.TYPE_BOOLEAN:
            return ParamSpec.boolean(name, "", "", flags, false)
        case GObject.TYPE_STRING:
            return ParamSpec.string(name, "", "", flags, "")
        case GObject.TYPE_INT:
            return ParamSpec.int(name, "", "", flags, MININT, MAXINT, 0)
        case GObject.TYPE_UINT:
            return ParamSpec.uint(name, "", "", flags, 0, MAXUINT, 0)
        case GObject.TYPE_INT64:
            return ParamSpec.int64(name, "", "", flags, MININT64, MAXINT64, 0)
        case GObject.TYPE_UINT64:
            return ParamSpec.uint64(name, "", "", flags, 0, Number.MAX_SAFE_INTEGER, 0)
        case GObject.TYPE_FLOAT:
            return ParamSpec.float(name, "", "", flags, MINFLOAT, MAXFLOAT, 0)
        case GObject.TYPE_DOUBLE:
            return ParamSpec.double(name, "", "", flags, Number.MIN_VALUE, Number.MIN_VALUE, 0)
        case GObject.TYPE_JSOBJECT:
            return ParamSpec.jsobject(name, "", "", flags)
        case GObject.TYPE_VARIANT:
            return ParamSpec.object(name, "", "", flags as any, GLib.Variant)

        case GObject.TYPE_ENUM:
        case GObject.TYPE_INTERFACE:
        case GObject.TYPE_BOXED:
        case GObject.TYPE_POINTER:
        case GObject.TYPE_PARAM:
        case GObject.type_from_name("GType"):
            throw Error(`cannot guess ParamSpec from GType "${type}"`)
        case GObject.TYPE_OBJECT:
        default:
            return ParamSpec.object(name, "", "", flags as any, type)
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

type MetaInfo = GObject.MetaInfo<never, Array<{ $gtype: GType<unknown> }>, never>

/**
 * Replacement for {@link GObject.registerClass}
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
export function register<Cls extends { new (...args: any): GObj }>(options: MetaInfo = {}) {
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

        registerClass({ ...options, Properties: props, Signals: signals }, cls)
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
}

Function.$gtype = Object.$gtype as FunctionConstructor["$gtype"]
Array.$gtype = Object.$gtype as ArrayConstructor["$gtype"]
