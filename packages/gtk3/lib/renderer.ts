import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=3.0"
import {
    appendChild,
    computed,
    createRenderer,
    isAccessor,
    newObject,
    removeChild,
    setChildren,
    type CCProps,
    type MaybeAccessor,
} from "gnim"

const dummyBuilder = new Gtk.Builder()
const encoder = new TextEncoder()
const slotType = Symbol("gnim.gtk3.slot")
const cssprovider = Symbol("gnim.gtk3.cssprovider")

function snakecase(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("-", "_")
        .toLowerCase()
}

function setCss(object: GObject.Object, css: string) {
    if (!(object instanceof Gtk.Widget)) {
        return console.warn(Error(`cannot set css on ${object}`))
    }

    if (!css.includes("{") || !css.includes("}")) {
        css = `* { ${css} }`
    }

    const ctx = object.get_style_context()

    if (cssprovider in object) {
        ctx.remove_provider(object[cssprovider] as Gtk.CssProvider)
    }

    const provider = new Gtk.CssProvider()
    provider.load_from_data(encoder.encode(css))
    ctx.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
    Object.assign(object, { [cssprovider]: provider })
}

function flattenClassList(classList: unknown): MaybeAccessor<string> {
    if (typeof classList === "string") return classList
    if (isAccessor(classList)) return flattenClassList(classList())
    if (Array.isArray(classList)) return classList.map(flattenClassList).join(" ")
    return ""
}

/**
 * @returns The slot that was set in JSX on `object`.
 */
export function getSlot(object: GObject.Object) {
    return slotType in object ? (object[slotType] as string) : null
}

export const { render } = createRenderer({
    constructObject(element, props) {
        const { slot, css, classList, ...rest } = props

        rest.visible ??= true

        const object = newObject(element, rest as Partial<CCProps<GObject.Object>>)

        if (typeof slot === "string") {
            Object.assign(object, { [slotType]: slot })
        }

        if (typeof css === "string") {
            this.setProperty(object, "css", css)
        }

        if (typeof classList === "string") {
            this.setProperty(object, "class", classList)
        }

        return object
    },
    setChildren(parent, children, prev) {
        if (setChildren in parent && typeof parent[setChildren] === "function") {
            if (parent[setChildren](children, prev)) return
        } else {
            for (const child of prev) {
                this.removeChild(parent, child)
            }
            for (const child of children) {
                this.appendChild(parent, child)
            }
        }
        for (const child of prev.filter((child) => !children.includes(child))) {
            this.destroyChild(parent, child)
        }
    },
    destroyChild(_, child) {
        if (child instanceof Gtk.Window) {
            child.destroy()
        }
    },
    createText(label) {
        return new Gtk.Label({ label, visible: true })
    },
    removeChild(parent, child) {
        if (removeChild in parent && typeof parent[removeChild] === "function") {
            if (parent[removeChild](child)) return
        }

        if (parent instanceof Gtk.Container && child instanceof Gtk.Widget) {
            return parent.remove(child)
        }

        if (parent instanceof Gtk.Application && child instanceof Gtk.Window) {
            return parent.remove_window(child)
        }

        throw Error(`cannot remove ${child} from ${parent}`)
    },
    appendChild(parent, child) {
        if (appendChild in parent && typeof parent[appendChild] === "function") {
            if (parent[appendChild](child)) return
        }

        if (
            child instanceof Gtk.Adjustment &&
            "set_adjustment" in parent &&
            typeof parent.set_adjustment === "function"
        ) {
            return parent.set_adjustment(child)
        }

        if (
            child instanceof Gtk.Widget &&
            parent instanceof Gtk.Stack &&
            child.name !== "" &&
            child.name !== null &&
            getSlot(child) === "named"
        ) {
            return parent.add_named(child, child.name)
        }

        if (child instanceof Gtk.Window && parent instanceof Gtk.Application) {
            return parent.add_window(child)
        }

        if (child instanceof Gtk.TextBuffer && parent instanceof Gtk.TextView) {
            return parent.set_buffer(child)
        }

        if (parent instanceof Gtk.Buildable) {
            return parent.vfunc_add_child(dummyBuilder, child, getSlot(child))
        }

        throw Error(`cannot add ${child} to ${parent}`)
    },
    prepareProps(object, props) {
        if (object.prototype instanceof GObject.Object && "class" in props) {
            const cn = props.class
            props.class = computed(() => flattenClassList(cn))
            return props
        }
        return props
    },
    setProperty(object, key, value) {
        if (key === "css" && typeof value === "string") {
            return setCss(object, value)
        }

        if (object instanceof Gtk.Widget && key === "class" && typeof value === "string") {
            const ctx = object.get_style_context()
            const names = value.split(/\s+/)

            for (const name of ctx.list_classes()) {
                ctx.remove_class(name)
            }

            for (const name of names) {
                ctx.add_class(name)
            }
            return
        }

        const getter = `get_${snakecase(key)}` as keyof typeof object

        let current: unknown

        if (
            getter in object &&
            typeof object[getter] === "function" &&
            object[getter].length === 0
        ) {
            current = (object[getter] as () => unknown)()
        } else {
            current = object[key as keyof typeof object]
        }

        if (!Object.is(current, value)) {
            Object.assign(object, { [key]: value })
        }
    },
    resolveTag(tag) {
        throw Error(`unresolved JSX tag: "${tag}"`)
    },
})

export type ClassValue = string | number | null | boolean | undefined | ClassValue[]
export type ClassList = MaybeAccessor<ClassValue> | MaybeAccessor<ClassList[]>

declare module "gnim" {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicClassAttributes<T> {
            slot?: string
            css?: T extends Gtk.Widget ? MaybeAccessor<string> : never
            class?: T extends Gtk.Widget ? ClassList : never
        }
    }
}
