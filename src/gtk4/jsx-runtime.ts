import Gtk from "gi://Gtk?version=4.0"
import Gio from "gi://Gio?version=2.0"
import { configue } from "../jsx/env.js"
import { getType, onCleanup, Accessor, Fragment } from "../index.js"

import type Adw from "gi://Adw"
const adw = await import("gi://Adw").then((m) => m.default).catch(() => null)

const dummyBuilder = new Gtk.Builder()

const { intrinsicElements } = configue({
    initProps(ctor) {
        if (ctor === Gtk.Stack) {
            const keys: Array<Extract<keyof Gtk.Stack, string>> = [
                "visibleChildName",
                "visible_child_name",
            ]
            return keys
        }
        if (adw && ctor === adw.ToggleGroup) {
            const keys: Array<Extract<keyof Adw.ToggleGroup, string>> = [
                "active",
                "activeName",
                "active_name",
            ]
            return keys
        }
    },
    setCss(object, css) {
        if (!(object instanceof Gtk.Widget)) {
            return console.warn(Error(`cannot set css on ${object}`))
        }

        const ctx = object.get_style_context()
        let provider: Gtk.CssProvider

        const setter = (css: string) => {
            if (!css.includes("{") || !css.includes("}")) {
                css = `* { ${css} }`
            }

            if (provider) ctx.remove_provider(provider)

            provider = new Gtk.CssProvider()
            provider.load_from_string(css)
            ctx.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
        }

        if (css instanceof Accessor) {
            setter(css.get())
            const dispose = css.subscribe(() => setter(css.get()))
            onCleanup(dispose)
        } else {
            setter(css)
        }
    },

    setClass(object, className) {
        if (!(object instanceof Gtk.Widget)) {
            return console.warn(Error(`cannot set className on ${object}`))
        }

        if (className instanceof Accessor) {
            object.cssClasses = className.get().split(/\s+/)
            const dispose = className.subscribe(
                () => (object.cssClasses = className.get().split(/\s+/)),
            )
            onCleanup(dispose)
        } else {
            object.set_css_classes(className.split(/\s+/))
        }
    },

    textNode(text) {
        return Gtk.Label.new(text.toString())
    },

    // `set_child` and especially `remove` might be way too generic and there might
    // be cases where it does not actually do what we want it to do
    //
    // if there is a usecase for either of these two that does something else than
    // we expect it to do here in a JSX context we have to check for known instances
    removeChild(parent, child) {
        if (parent instanceof Gtk.Widget && child instanceof Gtk.EventController) {
            return parent.remove_controller(child)
        }

        if ("set_child" in parent && typeof parent.set_child == "function") {
            return parent.set_child(null)
        }

        if ("remove" in parent && typeof parent.remove == "function") {
            return parent.remove(child)
        }

        throw Error(`cannot remove ${child} from ${parent}`)
    },
    appendChild(parent, child) {
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
    },
})

export { Fragment, intrinsicElements }
export { jsx, jsxs } from "../jsx/jsx.js"
