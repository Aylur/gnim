import Gtk from "gi://Gtk?version=3.0"
import { configue } from "../jsx/env.js"
import { getType, onCleanup, Accessor, Fragment } from "../index.js"

const dummyBuilder = new Gtk.Builder()

const { intrinsicElements } = configue({
    initProps(ctor, props) {
        props.visible ??= true
        if (ctor === Gtk.Stack) {
            const keys: Array<Extract<keyof Gtk.Stack, string>> = [
                "visibleChildName",
                "visible_child_name",
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
            if (!css.includes("{") || !css.includes("}")) css = `* { ${css} }`

            if (provider) ctx.remove_provider(provider)

            provider = new Gtk.CssProvider()
            provider.load_from_data(new TextEncoder().encode(css))
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

        const ctx = object.get_style_context()
        const setter = (names: string) => {
            for (const name of ctx.list_classes()) {
                ctx.remove_class(name)
            }

            for (const name of names.split(/\s+/)) {
                ctx.add_class(name)
            }
        }

        if (className instanceof Accessor) {
            setter(className.get())
            const dispose = className.subscribe(() => setter(className.get()))
            onCleanup(dispose)
        } else {
            setter(className)
        }
    },
    textNode(text) {
        return new Gtk.Label({ label: text.toString(), visible: true })
    },
    removeChild(parent, child) {
        if (parent instanceof Gtk.Container && child instanceof Gtk.Widget) {
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
    defaultCleanup(object) {
        if (object instanceof Gtk.Widget) {
            object.destroy()
        }
    },
})

export { Fragment, intrinsicElements }
export { jsx, jsxs } from "../jsx/jsx.js"
