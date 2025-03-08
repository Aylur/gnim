import Gtk from "gi://Gtk?version=4.0"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject"
import Fragment from "../jsx/Fragment.js"
import { configue, gtkType } from "../jsx/index.js"
import { Binding, sync } from "../state.js"

const dummyBuilder = new Gtk.Builder()

function type(object: GObject.Object) {
    return gtkType in object ? object[gtkType] as string : null
}

function add(parent: Gtk.Buildable, child: GObject.Object, _: number) {
    parent.vfunc_add_child(dummyBuilder, child, type(child))
}

function specialRemove(_parent: GObject.Object, _child: GObject.Object) {
    // TODO: add any special case
    return false
}

function specialAdd(parent: GObject.Object, child: GObject.Object, _: number) {
    // TODO: add any other special case
    if (
        child instanceof Gtk.Adjustment
        && "set_adjustment" in parent
        && typeof parent.set_adjustment === "function"
    ) {
        parent.set_adjustment(child)
        return true
    }

    if (
        child instanceof Gtk.Widget
        && parent instanceof Gtk.Stack
        && child.name !== ""
        && child.name !== null
        && type(child) === "named"
    ) {
        parent.add_named(child, child.name)
        return true
    }

    if (child instanceof Gtk.Popover && parent instanceof Gtk.MenuButton) {
        parent.set_popover(child)
        return true
    }

    if (
        child instanceof Gio.MenuModel && (
            parent instanceof Gtk.MenuButton
            || parent instanceof Gtk.PopoverMenu
        )
    ) {
        parent.set_menu_model(child)
        return true
    }

    if (child instanceof Gio.MenuItem && parent instanceof Gio.Menu) {
        // reutnr
    }

    return false
}

function remove(parent: GObject.Object, child: GObject.Object) {
    if (specialRemove(parent, child)) return

    if ("set_child" in parent && typeof parent.set_child == "function") {
        return parent.set_child(null)
    }

    if ("remove" in parent && typeof parent.remove == "function") {
        return parent.remove(child)
    }

    throw Error(`cannot remove ${child} from ${parent}`)
}

export const { addChild, intrinsicElements } = configue({
    intrinsicElements: {},
    setCss(object, css) {
        if (!(object instanceof Gtk.Widget)) {
            return console.warn(Error(`cannot set css on ${object}`))
        }

        const ctx = object.get_style_context()
        let provider: Gtk.CssProvider

        const setter = (css: string) => {
            if (!css.includes('{') || !css.includes('}'))
                css = `* { ${css} }`;

            if (provider)
                ctx.remove_provider(provider);

            provider = new Gtk.CssProvider();
            provider.load_from_string(css)
            ctx.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
        }

        if (css instanceof Binding) {
            css.subscribe(object, setter)
            setter(css.get())
        } else {
            setter(css)
        }
    },
    setClass(object, className) {
        if (!(object instanceof Gtk.Widget)) {
            return console.warn(Error(`cannot set className on ${object}`))
        }

        if (className instanceof Binding) {
            sync(object, "cssClasses", className.as(cn => cn.split(/\s+/)))
        } else {
            object.set_css_classes(className.split(/\s+/))
        }
    },
    addChild(parent, child, index = -1) {
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

                const ids = [
                    child.connect("child-added", (_, ch: unknown, index: number) => {
                        if (!(ch instanceof GObject.Object)) {
                            console.error(TypeError(`cannot add ${ch} to ${parent}`))
                            return
                        }
                        addChild(parent, ch, index)
                    }),
                    child.connect("child-removed", (_, ch: unknown) => {
                        if (!(ch instanceof GObject.Object)) {
                            console.error(TypeError(`cannot remove ${ch} from ${parent}`))
                            return
                        }
                        remove(parent, ch)
                    }),
                ]

                parent.connect("destroy", () => ids.map(id => child.disconnect(id)))
                return
            }

            add(parent, child, index)
            return
        }

        throw Error(`cannot add ${child} to ${parent}`)
    },
})

export { Fragment }
export { jsx, jsxs } from "../jsx/index.js"
