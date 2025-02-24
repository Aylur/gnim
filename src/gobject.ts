import GObject from "gi://GObject"
export { GObject, GObject as default }

const meta = Symbol("meta")
const priv = Symbol("priv")

const { ParamSpec, ParamFlags } = GObject

function isGType(obj: any): obj is GObject.GType {
    return GObject.type_check_is_value_type(obj)
}

const kebabify = (str: string) => str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replaceAll("_", "-")
    .toLowerCase()

type SignalDeclaration = {
    flags?: GObject.SignalFlags
    accumulator?: GObject.AccumulatorType
    return_type?: GObject.GType
    param_types?: Array<GObject.GType>
}

type PropertyDeclaration =
    | ((name: string, flags: GObject.ParamFlags) => GObject.ParamSpec)
    | InstanceType<typeof GObject.ParamSpec>
    | { $gtype: GObject.GType }
    | typeof String
    | typeof Number
    | typeof Boolean
    | typeof Object

type GObjectConstructor = {
    [meta]?: {
        Properties?: { [key: string]: GObject.ParamSpec }
        Signals?: { [key: string]: GObject.SignalDefinition }
    }
    new(...args: any[]): any
}

type MetaInfo = GObject.MetaInfo<never, Array<{ $gtype: GObject.GType }>, never>

export function register(options: MetaInfo = {}) {
    return function (cls: GObjectConstructor) {
        const t = options.Template
        if (typeof t === "string" && !t.startsWith("resource://") && !t.startsWith("file://")) {
            options.Template = new TextEncoder().encode(t)
        }

        GObject.registerClass({
            Signals: { ...cls[meta]?.Signals },
            Properties: { ...cls[meta]?.Properties },
            ...options,
        }, cls)

        delete cls[meta]
    }
}

export function property(declaration: PropertyDeclaration = Object) {
    return function (target: any, prop: any, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}
        target.constructor[meta].Properties ??= {}

        const name = kebabify(prop)

        if (!desc) {
            const spec = pspec(name, ParamFlags.READWRITE, declaration)
            target.constructor[meta].Properties[name] = spec

            Object.defineProperty(target, prop, {
                get() {
                    return this[priv]?.[prop] ?? spec.get_default_value()
                },
                set(v: any) {
                    if (v !== this[prop]) {
                        this[priv] ??= {}
                        this[priv][prop] = v
                        this.notify(name)
                    }
                },
            })

            Object.defineProperty(target, `set_${name.replace("-", "_")}`, {
                value(v: any) {
                    this[prop] = v
                },
            })

            Object.defineProperty(target, `get_${name.replace("-", "_")}`, {
                value() {
                    return this[prop]
                },
            })
        } else {
            let flags = 0
            if (desc.get) flags |= ParamFlags.READABLE
            if (desc.set) flags |= ParamFlags.WRITABLE


            const spec = pspec(name, flags, declaration)
            target.constructor[meta].Properties[name] = spec
        }
    }
}

export function signal(...params: Array<{ $gtype: GObject.GType } | GObject.GType>):
    (target: any, signal: any, desc?: PropertyDescriptor) => void

export function signal(declaration?: SignalDeclaration):
    (target: any, signal: any, desc?: PropertyDescriptor) => void

export function signal(
    declaration?: SignalDeclaration | { $gtype: GObject.GType } | GObject.GType,
    ...params: Array<{ $gtype: GObject.GType } | GObject.GType>
) {
    return function (target: any, signal: any, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}
        target.constructor[meta].Signals ??= {}

        const name = kebabify(signal)

        if (declaration || params.length > 0) {
            const arr = [declaration, ...params].map(v => {
                if (isGType(v)) return v
                throw Error(`${v} is not a valid GType`)
            })

            target.constructor[meta].Signals[name] = {
                param_types: arr,
            }
        } else {
            target.constructor[meta].Signals[name] = declaration || {
                param_types: [],
            }
        }

        if (!desc) {
            Object.defineProperty(target, signal, {
                value: function (...args: any[]) {
                    this.emit(name, ...args)
                },
            })
        } else {
            const og: ((...args: any[]) => void) = desc.value
            desc.value = function (...args: any[]) {
                // @ts-expect-error not typed
                this.emit(name, ...args)
            }
            Object.defineProperty(target, `on_${name.replace("-", "_")}`, {
                value: function (...args: any[]) {
                    return og.apply(this, args)
                },
            })
        }
    }
}

function pspec(name: string, flags: GObject.ParamFlags, declaration: PropertyDeclaration) {
    if (declaration instanceof ParamSpec)
        return declaration

    if (declaration === Object) {
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

    throw Error("invalid PropertyDeclaration")
}
