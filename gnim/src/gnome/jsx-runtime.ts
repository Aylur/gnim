/* eslint-disable @typescript-eslint/ban-ts-comment */
// Gnome support is experimental since EGO does not support a build step.
// Clutter and St versions are regularly updated so we don't import the
// versioned namespaces and simply treat this module like regular JS

// @ts-expect-error
import _Clutter from "gi://Clutter"
// @ts-expect-error
import _St from "gi://St"
import { configue } from "../jsx/env.js"
import { onCleanup, Accessor, Fragment } from "../index.js"
import type GObject from "gi://GObject?version=2.0"

declare class _ClutterActor extends GObject.Object {
    add_action(action: _ClutterAction): void
    remove_action(action: _ClutterAction): void
    add_child(child: _ClutterActor): void
    remove_child(child: _ClutterActor): void
    add_constraint(child: _ClutterConstraint): void
    remove_constraint(child: _ClutterConstraint): void
    set_layout_manager(manager: _ClutterLayoutManager | null): void
    destroy(): void
}

declare class _ClutterAction extends GObject.Object {}
declare class _ClutterConstraint extends GObject.Object {}
declare class _ClutterLayoutManager extends GObject.Object {}

declare class _StWidget extends GObject.Object {
    style: string
    set_style(s: string): void
    styleClass: string
    set_style_class_name(s: string): void
}

const St = _St as {
    Widget: typeof _StWidget
}

const Clutter = _Clutter as {
    Actor: typeof _ClutterActor
    Action: typeof _ClutterAction
    Constraint: typeof _ClutterConstraint
    LayoutManager: typeof _ClutterLayoutManager
}

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
        return _St.Label.new(text.toString())
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
