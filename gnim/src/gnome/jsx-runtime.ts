import Clutter from "gi://Clutter"
import St from "gi://St"
import { configue } from "../jsx/env.js"
import { onCleanup, Accessor, Fragment } from "../index.js"

const { intrinsicElements } = configue({
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
    textNode(text) {
        return St.Label.new(text.toString())
    },
    removeChild(parent, child) {
        if (parent instanceof Clutter.Actor) {
            if (child instanceof Clutter.Action) {
                return parent.remove_action(child)
            }
            if (child instanceof Clutter.Actor) {
                return parent.remove_child(child)
            }
            if (child instanceof Clutter.Constraint) {
                return parent.remove_constraint(child)
            }
            if (child instanceof Clutter.LayoutManager) {
                return parent.set_layout_manager(null)
            }
        }

        throw Error(`cannot remove ${child} from ${parent}`)
    },
    appendChild(parent, child) {
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
    },
    defaultCleanup(object) {
        if (object instanceof Clutter.Actor) {
            object.destroy()
        }
    },
})

export { Fragment, intrinsicElements }
export { jsx, jsxs } from "../jsx/jsx.js"
