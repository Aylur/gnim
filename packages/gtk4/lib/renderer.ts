import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
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
const slotType = Symbol("gnim.gtk4.slot")
const cssprovider = Symbol("gnim.gtk4.cssprovider")

class UnknownMethodError extends Error {
    constructor(name: string, parent: GObject.Object, child: GObject.Object) {
        super(
            `Method "${name}" for parent ${parent} and child ${child} is not registered. ` +
                "You should open an issue about this so that we can add support.",
        )
    }
}

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
    provider.load_from_string(css)
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
    destroyChild(parent, child) {
        if (parent instanceof Gio.Application && child instanceof Gtk.Window) {
            child.destroy()
        }
    },
    createText: Gtk.Label.new,
    removeChild(parent, child) {
        if (removeChild in parent && typeof parent[removeChild] === "function") {
            if (parent[removeChild](child)) return
        }

        if (parent instanceof Gtk.Widget && child instanceof Gtk.EventController) {
            return parent.remove_controller(child)
        }

        if (child instanceof Gtk.Widget) {
            if (parent instanceof Gtk.CenterBox) {
                switch (getSlot(child)) {
                    case "start":
                        return parent.set_start_widget(null)
                    case "center":
                        return parent.set_center_widget(null)
                    case "end":
                        return parent.set_end_widget(null)
                }
            }

            if (parent instanceof Gtk.Paned) {
                switch (getSlot(child)) {
                    case "start":
                        return parent.set_start_child(null)
                    case "end":
                        return parent.set_end_child(null)
                }
            }

            if (parent instanceof Gtk.Overlay) {
                if (getSlot(child) === "overlay") {
                    return parent.remove_overlay(child)
                }
                return parent.set_child(null)
            }

            if (parent instanceof Gtk.Notebook) {
                const pageNum = parent.page_num(child)
                if (pageNum !== -1) {
                    return parent.remove_page(pageNum)
                }
            }

            // Most Bin-like containers have a .set_child()
            if ("set_child" in parent && typeof parent.set_child == "function") {
                return parent.set_child(null)
            }

            // Most mulit children containers have a .remove()
            if ("remove" in parent && typeof parent.remove == "function") {
                return parent.remove(child)
            }
        }

        if (parent instanceof Gtk.Application && child instanceof Gtk.Window) {
            return parent.remove_window(child)
        }

        throw new UnknownMethodError("removeChild", parent, child)
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

        if (child instanceof Gtk.Popover && parent instanceof Gtk.MenuButton) {
            return parent.set_popover(child)
        }

        if (
            child instanceof Gio.MenuModel &&
            (parent instanceof Gtk.MenuButton || parent instanceof Gtk.PopoverMenu)
        ) {
            return parent.set_menu_model(child)
        }

        if (child instanceof Gtk.Window && parent instanceof Gtk.Application) {
            return parent.add_window(child)
        }

        if (child instanceof Gtk.TextBuffer && parent instanceof Gtk.TextView) {
            return parent.set_buffer(child)
        }

        if (parent instanceof Gtk.CenterBox && child instanceof Gtk.Widget) {
            const slot = getSlot(child)
            if (!slot) {
                console.warn("Trying to append child to Gtk.CenterBox without a specified slot")
                return
            }
            if (slot !== "center" && slot !== "start" && slot !== "end") {
                console.warn(
                    `Invalid Gtk.CenterBox child slot: has to be one of "start", "center", "end"`,
                )
                return
            }
        }

        if (parent instanceof Gtk.Buildable) {
            return parent.vfunc_add_child(dummyBuilder, child, getSlot(child))
        }

        throw new UnknownMethodError("appendChild", parent, child)
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
            return object.set_css_classes(value.split(/\s+/))
        }

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
