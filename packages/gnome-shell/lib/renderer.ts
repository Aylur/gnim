import GObject from "gi://GObject?version=2.0"
import {
    appendChild,
    MissingMethodError,
    newObject,
    removeChild,
    render as renderGnim,
    setChildren,
    type CC,
    type CCProps,
    type FC,
    type GnimNode,
    type Renderer,
} from "gnim"

// @ts-expect-error we don't generate versionless to avoid pinning gnome version
import St from "gi://St"
// @ts-expect-error we don't generate versionless to avoid pinning gnome version
import Clutter from "gi://Clutter"

const _St = St as typeof import("gi://St?version=18").GI.St
const _Clutter = Clutter as typeof import("gi://Clutter?version=18").GI.Clutter

function snakecase(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("-", "_")
        .toLowerCase()
}

export class GnomeRenderer implements Renderer {
    resolveTag(): CC | FC {
        throw new Error("Function not implemented.")
    }
    constructObject(element: CC, props: Record<string, unknown>): GObject.Object {
        return newObject(element, props as CCProps<GObject.Object>)
    }
    createText(string: string): GObject.Object {
        return _St.Label.new(string)
    }
    prepareProps(_: CC, props: Record<string, unknown>): Record<string, unknown> {
        return props
    }
    setProperty(object: GObject.Object, key: string, value: unknown): void {
        if (object instanceof _Clutter.Actor && key === "visible" && typeof value === "boolean") {
            /**
             * special-cased for conveniency, otherwise users would have to specify a reactive
             * `visible` prop with {@link _Clutter.Actor.prototype.showOnSetParent} set to false
             */
            object.visible = value
            return
        }

        const getter = `get_${snakecase(key)}` as keyof typeof object

        let current: unknown

        if (
            getter in object &&
            typeof object[getter] === "function" &&
            object[getter].length === 0
        ) {
            current = (object[getter] as () => unknown)()
        } else {
            current = object[key as keyof typeof object]
        }

        if (!Object.is(current, value)) {
            Object.assign(object, { [key]: value })
        }
    }
    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void {
        if (
            setChildren in parent &&
            typeof parent[setChildren] === "function" &&
            parent[setChildren](children, prev)
        ) {
            return
        }
        for (const child of prev) {
            this.removeChild(parent, child)
        }
        for (const child of children) {
            this.appendChild(parent, child)
        }
    }
    appendChild(parent: GObject.Object, child: GObject.Object): void {
        if (appendChild in parent && typeof parent[appendChild] === "function") {
            if (parent[appendChild](child)) return
        }

        if (parent instanceof _Clutter.Actor) {
            if (child instanceof _Clutter.Actor) {
                return parent.add_child(child)
            }
            if (child instanceof _Clutter.Action) {
                return parent.add_action(child)
            }
            if (child instanceof _Clutter.Constraint) {
                return parent.add_constraint(child)
            }
            if (child instanceof _Clutter.LayoutManager) {
                return parent.set_layout_manager(child)
            }
        }

        throw new MissingMethodError("appendChild", parent, child)
    }
    removeChild(parent: GObject.Object, child: GObject.Object): void {
        if (removeChild in parent && typeof parent[removeChild] === "function") {
            if (parent[removeChild](child)) return
        }

        if (parent instanceof _Clutter.Actor) {
            if (child instanceof _Clutter.Action) {
                return parent.remove_action(child)
            }
            if (child instanceof _Clutter.Actor) {
                return parent.remove_child(child)
            }
            if (child instanceof _Clutter.Constraint) {
                return parent.remove_constraint(child)
            }
            if (child instanceof _Clutter.LayoutManager) {
                return parent.set_layout_manager(null)
            }
        }

        throw new MissingMethodError("removeChild", parent, child)
    }
    disposeObject(object: GObject.Object): void {
        if (object instanceof _Clutter.Actor) {
            object.destroy()
        }
    }
}

export function render(element: () => GnimNode, root?: GObject.Object) {
    return renderGnim(new GnomeRenderer(), element, root)
}
