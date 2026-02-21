import type GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import type { CC } from "./element.js"

export const IS_DEV = true // TODO:

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

export function isGObjectCtor(ctor: any): ctor is CC {
    return ctor.prototype instanceof GObject.Object
}

// onNotifyPropName -> notify::prop-name
// onPascalName:detailName -> pascal-name::detail-name
export function signalName(key: string): string {
    const [sig, detail] = kebabcase(key.slice(2)).split(":")

    if (sig.startsWith("notify-")) {
        return `notify::${sig.slice(7)}`
    }

    return detail ? `${sig}::${detail}` : sig
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
    const snake_key = snakecase(key)

    const getter = `get_${snake_key}` as keyof typeof object
    const setter = `set_${snake_key}` as keyof typeof object

    let current: unknown

    if (getter in object && typeof object[getter] === "function") {
        current = (object[getter] as () => unknown)()
    } else {
        current = object[key as keyof typeof object]
    }

    if (current !== value) {
        if (setter in object && typeof object[setter] === "function") {
            ;(object[setter] as (v: unknown) => void)(value)
        } else {
            Object.assign(object, { [key]: value })
        }
    }
}

// Bindings work over properties in kebab-case because thats the convention of gobject
// however in js its either snake_case or camelCase
// also on DBus interfaces its PascalCase by convention
// so as a workaround we use get_property_name and only use the property field as a fallback
export function definePropertyGetter<T extends object>(object: T, prop: Extract<keyof T, string>) {
    Object.defineProperty(object, `get_${kebabcase(prop).replaceAll("-", "_")}`, {
        configurable: false,
        enumerable: true,
        value: () => object[prop],
    })
}
