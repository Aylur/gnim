import GLib from "gi://GLib?version=2.0"
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

export function pascalcase(str: string) {
    return str
        .replace(/[-_](.)/g, (_, char) => char.toUpperCase())
        .replace(/^./, (char) => char.toUpperCase())
}

export function snakecase(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("-", "_")
        .toLowerCase()
}

// port of GJS's `_getCallerBasename` that lets us skip middlemen urls
function callerBasename(...skipUrls: string[]): string | null {
    const scriptRegex = /^(.+:\/\/)?(.*\/)?(.+)\.js$/
    const stackLineRegex = /@(.+:\/\/)?(.*\/)?(.+)\.js:\d+(:[\d]+)?$/
    const stackLines = new Error().stack?.trim().split("\n") ?? []

    const skip = skipUrls.map((url) => {
        const match = url.match(scriptRegex)
        return match ? { dir: match[2], file: match[3] } : null
    })

    for (const line of stackLines) {
        const match = line.match(stackLineRegex)
        if (!match) continue

        let scriptDir = match[2]
        const scriptBasename = match[3]

        if (skip.some((s) => s && s.dir === scriptDir && s.file === scriptBasename)) continue
        if (scriptDir && scriptDir.startsWith("/org/gnome/gjs/")) continue

        let basename = scriptBasename
        if (scriptDir) {
            scriptDir = scriptDir.replace(/^\/|\/$/g, "")
            basename = `${scriptDir.split("/").reverse()[0]}_${basename}`
        }
        return basename
    }

    return null
}

// mimics GJS's `_createGTypeName`
export function createGTypeName(name: string, ...skipUrls: string[]) {
    if (GObject.gtypeNameBasedOnJSPath) {
        const caller = callerBasename(import.meta.url, ...skipUrls)
        if (caller) name = `${caller}_${name}`
    }

    if (name === "") {
        name = `anonymous_${GLib.uuid_string_random()}`
    }

    return `Gjs_${name}`.replace(/[^a-z0-9+_-]/gi, "_")
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

export function findDescriptor(
    obj: object | null,
    key: PropertyKey,
): PropertyDescriptor | undefined {
    if (obj === null) return

    return (
        Object.getOwnPropertyDescriptor(obj, key) ?? findDescriptor(Object.getPrototypeOf(obj), key)
    )
}

export function isGObjectCtor(ctor: any): ctor is { new (...args: any): GObject.Object } {
    return ctor.prototype instanceof GObject.Object
}

export type XmlNode = {
    name: string
    attributes?: Record<string, string | number | undefined>
    children?: Array<XmlNode> | string
}

export function xml(node: XmlNode | string): string {
    if (typeof node === "string") return GLib.markup_escape_text(node, -1)

    const { name, attributes, children } = node

    const attrs = Object.entries(attributes ?? {})
        .filter((entry): entry is [string, string | number] => typeof entry[1] !== "undefined")
        .map(([key, value]) => ` ${key}="${GLib.markup_escape_text(String(value), -1)}"`)
        .join("")

    const inner =
        typeof children === "string"
            ? GLib.markup_escape_text(children, -1)
            : (children ?? []).map(xml).join("")

    return inner.length > 0 ? `<${name}${attrs}>${inner}</${name}>` : `<${name}${attrs} />`
}
