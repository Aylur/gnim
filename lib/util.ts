import type GObject from "gi://GObject?version=2.0"
import type GLib from "gi://GLib?version=2.0"

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

export type Keyof<T> = Extract<keyof T, string>

export type InferVariant<S extends string> = ReturnType<GLib.Variant<S>["unpack"]>
export type DeepInferVariant<S extends string> = ReturnType<GLib.Variant<S>["deepUnpack"]>
export type RecursiveInferVariant<S extends string> = ReturnType<GLib.Variant<S>["recursiveUnpack"]>

export type MergeProps<A, B> = {
    [K in keyof A | keyof B]: K extends keyof A
        ? K extends keyof B
            ? A[K] | B[K]
            : A[K]
        : K extends keyof B
          ? B[K]
          : never
}
