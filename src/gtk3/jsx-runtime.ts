import Gtk from "gi://Gtk?version=3.0"
import GObject from "gi://GObject"
import { configue } from "../jsx/env.js"
import {
    getType,
    onCleanup,
    addChild as _add,
    removeChild as _remove,
    Accessor,
    Fragment,
} from "../index.js"

const dummyBuilder = new Gtk.Builder()

function add(parent: Gtk.Buildable, child: GObject.Object, _: number) {
    if (!specialAdd(parent, child, _)) {
        parent.vfunc_add_child(dummyBuilder, child, getType(child))
    }
}

function specialAdd(parent: GObject.Object, child: GObject.Object, index: number) {
    if (_add in parent && typeof parent[_add] === "function") {
        parent[_add](child, getType(child), index)
        return true
    }

    if (
        child instanceof Gtk.Adjustment &&
        "set_adjustment" in parent &&
        typeof parent.set_adjustment === "function"
    ) {
        parent.set_adjustment(child)
        return true
    }

    if (
        child instanceof Gtk.Widget &&
        parent instanceof Gtk.Stack &&
        child.name !== "" &&
        child.name !== null &&
        getType(child) === "named"
    ) {
        parent.add_named(child, child.name)
        return true
    }

    if (child instanceof Gtk.Window && parent instanceof Gtk.Application) {
        parent.add_window(child)
        return true
    }

    if (child instanceof Gtk.TextBuffer && parent instanceof Gtk.TextView) {
        parent.set_buffer(child)
        return true
    }

    return false
}

function remove(parent: GObject.Object, child: GObject.Object) {
    if (_remove in parent && typeof parent[_remove] === "function") {
        parent[_remove](child)
        return
    }

    if (parent instanceof Gtk.Container && child instanceof Gtk.Widget) {
        return parent.remove(child)
    }

    throw Error(`cannot remove ${child} from ${parent}`)
}

const { addChild, intrinsicElements } = configue({
    initProps(props) {
        props.visible ??= true
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
    addChild(parent, child, index = -1) {
        if (!(child instanceof GObject.Object)) {
            child = new Gtk.Label({ label: String(child), visible: true })
        }

        if (specialAdd(parent, child, index)) return

        if (parent instanceof Fragment) {
            parent.addChild(child)
            return
        }

        if (parent instanceof Gtk.Buildable) {
            if (child instanceof Fragment) {
                for (const ch of child.children) {
                    add(parent, ch, index)
                }

                child.connect("child-added", (_, ch: unknown, index: number) => {
                    if (!(ch instanceof GObject.Object)) {
                        console.error(TypeError(`cannot add ${ch} to ${parent}`))
                        return
                    }
                    addChild(parent, ch, index)
                })

                child.connect("child-removed", (_, ch: unknown) => {
                    if (!(ch instanceof GObject.Object)) {
                        console.error(TypeError(`cannot remove ${ch} from ${parent}`))
                        return
                    }
                    remove(parent, ch)
                })

                onCleanup(() => child.destroy())
                return
            }

            add(parent, child, index)
            return
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
