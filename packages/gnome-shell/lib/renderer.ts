import GObject from "gi://GObject?version=2.0"
import {
    BaseRenderer,
    MissingMethodError,
    render as renderGnim,
    type CC,
    type CCProps,
    type GnimNode,
} from "gnim"

// @ts-expect-error we don't generate versionless to avoid pinning gnome version
import St from "gi://St"
// @ts-expect-error we don't generate versionless to avoid pinning gnome version
import Clutter from "gi://Clutter"

const _St = St as typeof import("gi://St?version=18").GI.St
const _Clutter = Clutter as typeof import("gi://Clutter?version=18").GI.Clutter

export class GnomeRenderer extends BaseRenderer {
    constructObject(element: CC, props: Record<string, unknown>): GObject.Object {
        return this.newObject(element, props as CCProps<GObject.Object>)
    }

    createText(string: string): GObject.Object {
        return _St.Label.new(string)
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

        super.setProperty(object, key, value)
    }

    appendChild(parent: GObject.Object, child: GObject.Object): void {
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
