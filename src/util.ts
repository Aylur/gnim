export function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}

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
// so as a workaround we use get_property_name as a workaround
export function getterWorkaround<T extends object>(object: T, prop: Extract<keyof T, string>) {
    Object.defineProperty(object, `get_${kebabify(prop).replaceAll("-", "_")}`, {
        configurable: false,
        enumerable: true,
        value: () => object[prop],
    })
}
