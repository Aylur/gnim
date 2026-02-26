import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import { newObject } from "../jsx/element.js"
import { createRenderer } from "../jsx/render.js"
import { Accessor } from "../jsx/state.js"

const dummyBuilder = new Gtk.Builder()
const type = Symbol("gnim.gtk4.type")
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

export function getType(object: GObject.Object) {
    return type in object ? (object[type] as string) : null
}

// `set_child` and especially `remove` might be way too generic and there might
// be cases where it does not actually do what we want it to do
//
// if there is a usecase for either of these two that does something else than
// we expect it to do here in a JSX context we have to check for known instances
function removeChild(parent: GObject.Object, child: GObject.Object) {
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
}

function appendChild(parent: GObject.Object, child: GObject.Object) {
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
        getType(child) === "named"
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
        return parent.vfunc_add_child(dummyBuilder, child, getType(child))
    }

    throw Error(`cannot add ${child} to ${parent}`)
}

export const { render } = createRenderer({
    constructObject(element, props) {
        const { slot, ...rest } = props
        let css: string | null = null

        if ("css" in rest && typeof rest.css === "string") {
            css = rest.css
            delete rest.css
        }

        const obj = newObject(
            element as GObject.ObjectClass,
            rest as GObject.ConstructorProps<GObject.Object>,
        )

        if (typeof slot === "string") {
            Object.assign(obj, { [type]: slot })
        }

        if (typeof css === "string") {
            setCss(obj, css)
        }

        return obj
    },
    setChildren(parent, children, prev) {
        for (const child of prev) {
            removeChild(parent, child)
        }

        for (const child of children) {
            appendChild(parent, child)
        }
    },
    createText: Gtk.Label.new,
    appendChild,
    removeChild,
    setProperty(object, key, value) {
        if (key === "css" && typeof value === "string") {
            setCss(object, value)
        } else {
            Object.assign(object, { [key]: value })
        }
    },
})

declare module "gnim" {
    namespace JSX {
        interface IntrinsicClassAttributes<T> {
            slot?: T extends Gtk.Widget ? string : never
            css?: T extends Gtk.Widget ? string | Accessor<string> : never
        }
    }
}
