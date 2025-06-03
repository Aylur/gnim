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
import { getterWorkaround, kebabify } from "./util.js"

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
    signals: {
        [key: string]: {
            flags?: SignalFlags
            accumulator?: AccumulatorType
            return_type?: GType
            param_types?: Array<GType>
            method: (...arg: any[]) => unknown
        }
    }
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
        ctx: ClassFieldDecoratorContext<GObj, T>,
    ): (this: GObj, init: T) => T {
        const fieldName = assertField(ctx)
        const key = kebabify(fieldName)
        const meta: Partial<Meta> = ctx.metadata!

        meta.properties ??= {}
        meta.properties[fieldName] = { flags: ParamFlags.READWRITE, type: typeDeclaration }

        ctx.addInitializer(function () {
            getterWorkaround(this, fieldName as Extract<keyof GObj, string>)

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
    return function getter(
        getter: (this: GObj) => T,
        ctx: ClassGetterDecoratorContext<GObj, T>,
    ): (this: GObj) => T {
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
        ctx: ClassSetterDecoratorContext<GObj, T>,
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
    options?: {
        flags?: SignalFlags
        accumulator?: AccumulatorType
    },
): (
    method: (this: GObj, ...args: ParamTypes<Params>) => ParamType<Return>,
    ctx: ClassMethodDecoratorContext<GObj, typeof method>,
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
    method: (this: GObj, ...args: ParamTypes<Params>) => void,
    ctx: ClassMethodDecoratorContext<GObj, typeof method>,
) => typeof method

export function signal<
    Params extends Array<{ $gtype: GType } | GType>,
    Return extends { $gtype: GType } | GType,
>(
    ...args:
        | Params
        | [
              params: Params,
              returnType?: Return,
              options?: {
                  flags?: SignalFlags
                  accumulator?: AccumulatorType
              },
          ]
): (
    method: (this: GObj, ...args: ParamTypes<Params>) => ParamType<Return> | void,
    ctx: ClassMethodDecoratorContext<GObj, typeof method> | ClassFieldDecoratorContext<GObj>,
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
                options?: {
                    flags?: SignalFlags
                    accumulator?: AccumulatorType
                },
            ]

            signals[signalName] = {
                method,
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

function pspec(name: string, flags: ParamFlags, declaration: PropertyTypeDeclaration<unknown>) {
    if (declaration === undefined) {
        throw Error(`undefined ${name}`)
    }

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
        return ParamSpec.object(name, "", "", flags as any, declaration.$gtype)
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
            entries(meta.signals ?? {}).map(([signalName, { method, ...signal }]) => {
                defineProperty(cls.prototype, `on_${signalName.replaceAll("-", "_")}`, {
                    enumerable: false,
                    configurable: false,
                    value: method,
                })
                return [signalName, signal]
            }),
        )

        registerClass({ ...options, Properties: props, Signals: signals }, cls)
    }
}

/**
 * @experimental
 * Asserts a gtype in cases where the type is too loose/strict.
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
