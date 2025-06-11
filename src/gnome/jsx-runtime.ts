import Clutter from "gi://Clutter"
import St from "gi://St"
import GObject from "gi://GObject"
import { configue } from "../jsx/env.js"
import { onCleanup, Accessor, Fragment } from "../jsx/index.js"

function add(parent: GObject.Object, child: GObject.Object, _: number) {
    if (parent instanceof Clutter.Actor) {
        if (child instanceof Clutter.Action) {
            return parent.add_action(child)
        }
        if (child instanceof Clutter.Constraint) {
            return parent.add_constraint(child)
        }
        if (child instanceof Clutter.LayoutManager) {
            return parent.set_layout_manager(child)
        }
        if (child instanceof Clutter.Actor) {
            return parent.add_child(child)
        }
    }

    throw Error(`cannot add ${child} to ${parent}`)
}

function remove(parent: GObject.Object, child: GObject.Object) {
    if (child instanceof Clutter.Actor && parent instanceof Clutter.Actor) {
        return parent.remove_child(child)
    }

    throw Error(`cannot remove ${child} from ${parent}`)
}

const { intrinsicElements, addChild } = configue({
    setCss(object, css) {
        if (!(object instanceof St.Widget)) {
            return console.warn(Error(`cannot set css on ${object}`))
        }

        if (css instanceof Accessor) {
            object.style = css.get()
            const dispose = css.subscribe(() => (object.style = css.get()))
            onCleanup(dispose)
        } else {
            object.set_style(css)
        }
    },
    setClass(object, className) {
        if (!(object instanceof St.Widget)) {
            return console.warn(Error(`cannot set className on ${object}`))
        }

        if (className instanceof Accessor) {
            object.styleClass = className.get()
            const dispose = className.subscribe(() => (object.styleClass = className.get()))
            onCleanup(dispose)
        } else {
            object.set_style_class_name(className)
        }
    },
    addChild(parent, child, index = -1) {
        if (!(child instanceof GObject.Object)) {
            child = new St.Label({ text: String(child) })
        }

        if (parent instanceof Fragment) {
            parent.addChild(child)
            return
        }

        if (parent instanceof Clutter.Actor) {
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

                parent.connect("destroy", () => child.destroy())
                return
            }

            add(parent, child, index)
            return
        }

        console.error(TypeError(`cannot add ${child} to ${parent}`))
    },
    defaultCleanup(object) {
        if (object instanceof Clutter.Actor) {
            object.destroy()
        }
    },
})

export { Fragment, intrinsicElements }
export { jsx, jsxs } from "../jsx/jsx.js"
