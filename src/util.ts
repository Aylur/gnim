import type GLib from "gi://GLib"
import type GObject from "gi://GObject"

export function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

export function snakeify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("-", "_")
        .toLowerCase()
}

export function camelify(str: string) {
    return str.replace(/[-_](.)/g, (_, char) => char.toUpperCase())
}

export type Pascalify<S> = S extends `${infer Head}${"-" | "_"}${infer Tail}`
    ? `${Capitalize<Head>}${Pascalify<Tail>}`
    : S extends string
      ? Capitalize<S>
      : never

export type XmlNode = {
    name: string
    attributes?: Record<string, string>
    children?: Array<XmlNode>
}

export function xml({ name, attributes, children }: XmlNode) {
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

// Bindings work over properties in kebab-case because thats the convention of gobject
// however in js its either snake_case or camelCase
// also on DBus interfaces its PascalCase by convention
// so as a workaround we use get_property_name and only use the property field as a fallback
export function definePropertyGetter<T extends object>(object: T, prop: Extract<keyof T, string>) {
    Object.defineProperty(object, `get_${kebabify(prop).replaceAll("-", "_")}`, {
        configurable: false,
        enumerable: true,
        value: () => object[prop],
    })
}

// attempt setting a property of GObject.Object
export function set(obj: GObject.Object, prop: string, value: any) {
    const key = snakeify(prop)
    const getter = `get_${key}` as keyof typeof obj
    const setter = `set_${key}` as keyof typeof obj

    let current: unknown

    if (getter in obj && typeof obj[getter] === "function") {
        current = (obj[getter] as () => unknown)()
    } else {
        current = obj[prop as keyof typeof obj]
    }

    if (current !== value) {
        if (setter in obj && typeof obj[setter] === "function") {
            ;(obj[setter] as (v: any) => void)(value)
        } else {
            Object.assign(obj, { [prop]: value })
        }
    }
}

type Simple = "v" | "b" | "y" | "n" | "q" | "i" | "u" | "x" | "t" | "h" | "d" | "s" | "g" | "o"

type KV<T extends string> = T extends `${infer K}${infer S}`
    ? K extends string
        ? S extends string
            ? Record<Extract<InferVariant<K>, string | number>, InferVariant<S>>
            : never
        : never
    : never

// FIXME: this is a *very* naive implementation
// does not support nesting and only supports Simple arrays
// prettier-ignore
type Tuple<T extends string, Acc extends Array<unknown> = []> =
    T extends "" ? Acc :
    // simple
    T extends `${infer Head}${infer Tail}` ? Head extends Simple
        ? Tuple<Tail, [...Acc, InferVariant<Head>]> :
    // record
    T extends `a{${infer S}}${infer Tail}`
        ? Tuple<Tail, [...Acc, KV<S>]> :
    // array
    T extends `a${infer S}${infer Tail}`
        ? Tuple<Tail, [...Acc, Array<InferVariant<S>>]> :
    // tuple
    T extends `(${infer S})${infer Tail}`
        ? Tuple<Tail, [...Acc, Tuple<S>]> :
    any : any

// prettier-ignore
export type InferVariant<T extends string> =
    T extends "v" ? GLib.Variant<any> :
    T extends "b" ? boolean :
    T extends "y" | "n" | "q" | "i" | "u" | "x" | "t" | "h" | "d" ? number :
    T extends "s" | "g" ? string :
    T extends "o" ? `/${string}` :
    T extends `a{${infer S}}` ? KV<S> :
    T extends `a${infer S}` ? S extends string ? Array<InferVariant<S>> : never :
    T extends `(${infer S})` ? S extends string ? Tuple<S> : never :
    never
