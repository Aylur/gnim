import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import { newObject, type CC, type CCProps, type FC, type Props } from "../jsx/element.js"
import { createRenderer, appendChild, removeChild, setChildren } from "../jsx/render.js"
import { computed, isAccessor, type Accessor } from "../jsx/reactive.js"
import { setProperty } from "../util.js"

const dummyBuilder = new Gtk.Builder()
const slotType = Symbol("gnim.gtk4.slot")
const cssprovider = Symbol("gnim.gtk4.cssprovider")

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

function flattenClassList(classList: unknown): MaybeReactive<string> {
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
    destroyChild(parent: GObject.Object, child: GObject.Object) {
        if (parent instanceof Gio.Application && child instanceof Gtk.Window) {
            child.destroy()
        }
    },
    createText: Gtk.Label.new,
    // `set_child` and especially `remove` might be way too generic and there might
    // be cases where it does not actually do what we want it to do
    //
    // if there is a usecase for either of these two that does something else than
    // we expect it to do here in a JSX context we have to check for known instances
    removeChild(parent: GObject.Object, child: GObject.Object) {
        if (removeChild in parent && typeof parent[removeChild] === "function") {
            if (parent[removeChild](child)) return
        }

        if (parent instanceof Gtk.Widget && child instanceof Gtk.EventController) {
            return parent.remove_controller(child)
        }

        if ("set_child" in parent && typeof parent.set_child == "function") {
            return parent.set_child(null)
        }

        if ("remove" in parent && typeof parent.remove == "function") {
            return parent.remove(child)
        }

        if (parent instanceof Gtk.Application && child instanceof Gtk.Window) {
            return parent.remove_window(child)
        }

        throw Error(`cannot remove ${child} from ${parent}`)
    },
    appendChild(parent: GObject.Object, child: GObject.Object) {
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

        if (child instanceof Gio.MenuItem && parent instanceof Gio.Menu) {
            // TODO:
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
    prepareProps(object: CC, props: Props) {
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

        setProperty(object, key, value)
    },
    resolveTag(tag: string): CC | FC {
        throw Error(`unresolved JSX tag: "${tag}"`)
    },
})

type MaybeReactive<T> = T | Accessor<T>
export type ClassValue = string | number | null | boolean | undefined | ClassValue[]
export type ClassList = MaybeReactive<ClassValue> | MaybeReactive<ClassList[]>

declare module "gnim" {
    namespace JSX {
        interface IntrinsicClassAttributes<T> {
            slot?: string
            css?: T extends Gtk.Widget ? MaybeReactive<string> : never
            class?: T extends Gtk.Widget ? ClassList : never
        }
    }
}
