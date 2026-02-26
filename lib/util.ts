import type GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"

export function kebabcase(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

export function camelcase(str: string) {
    return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase())
}

export function snakecase(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("-", "_")
        .toLowerCase()
}

export type Prettify<T> = { [K in keyof T]: T[K] } & {}

export type Keyof<T> = Extract<keyof T, string>

export type PascalCase<S> = S extends `${infer Head}${"-" | "_"}${infer Tail}`
    ? `${Capitalize<Head>}${PascalCase<Tail>}`
    : S extends string
      ? Capitalize<S>
      : never

export type CamelCase<S> = S extends `${infer Head}${"-" | "_"}${infer Tail}`
    ? `${Lowercase<Head>}${PascalCase<Tail>}`
    : S extends string
      ? Lowercase<S>
      : never

export type KebabCase<
    S extends string,
    First extends boolean = true,
> = S extends `${infer C}${infer R}`
    ? C extends "-" | "_" | " "
        ? `${First extends true ? "" : "-"}${KebabCase<R, true>}`
        : C extends Lowercase<C>
          ? `${C}${KebabCase<R, false>}`
          : `${First extends true ? "" : "-"}${Lowercase<C>}${KebabCase<R, false>}`
    : ""

export type DeepInferVariant<S extends string> = ReturnType<GLib.Variant<S>["deepUnpack"]>
export type RecursiveInferVariant<S extends string> = ReturnType<GLib.Variant<S>["recursiveUnpack"]>

export function isGObjectCtor(ctor: any): ctor is { new (...args: any): GObject.Object } {
    return ctor.prototype instanceof GObject.Object
}

export const connect = GObject.signal_connect
export const disconnect = GObject.signal_handler_disconnect
export const emit = GObject.signal_emit_by_name

export type XmlNode = {
    name: string
    attributes?: Record<string, string | number>
    children?: Array<XmlNode> | string
}

export function xml(node: XmlNode | string) {
    if (typeof node === "string") {
        return node
    }
    const { name, attributes, children } = node
    let builder = `<${name}`

    const attrs = Object.entries(attributes ?? [])

    if (attrs.length > 0) {
        for (const [key, value] of attrs) {
            builder += ` ${key}="${value}"`
        }
    }

    if (children && children.length > 0) {
        builder += ">"
        for (const node of children) {
            builder += xml(node)
        }
        builder += `</${name}>`
    } else {
        builder += " />"
    }

    return builder
}

export function setProperty(object: GObject.Object, key: string, value: unknown) {
    const getter = `get_${snakecase(key)}` as keyof typeof object

    let current: unknown

    if (getter in object && typeof object[getter] === "function") {
        current = (object[getter] as () => unknown)()
    } else {
        current = object[key as keyof typeof object]
    }

    if (!Object.is(current, value)) {
        Object.assign(object, { [key]: value })
    }
}
