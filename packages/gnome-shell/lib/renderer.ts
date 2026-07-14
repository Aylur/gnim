import GObject from "gi://GObject?version=2.0"
import {
    appendChild,
    newObject,
    removeChild,
    render as renderGnim,
    setChildren,
    type CC,
    type FC,
    type GnimNode,
    type Renderer,
} from "gnim"

interface Actor extends GObject.Object {
    add_child(actor: Actor): void
    remove_child(actor: Actor): void
    add_action(action: GObject.Object): void
    remove_action(action: GObject.Object): void
    add_constraint(constraint: GObject.Object): void
    remove_constraint(constraint: GObject.Object): void
    set_layout_manager(layout_manager: GObject.Object | null): void
    destroy(): void
}

interface ActorClass extends GObject.ObjectClass {
    [Symbol.hasInstance](i: unknown): i is Actor
}

// gnome-shell only ships Clutter but not St. Their version number is also incremented each version
// which would make maintainance annoying and since EGO does not support modern typescript anyway
// we just shim some required interfaces instead of maintaining .gir files.
const { St, Clutter } = imports.gi as unknown as {
    St: {
        Widget: GObject.ObjectClass
        Label: { new: (label: string) => Actor }
    }
    Clutter: {
        Actor: ActorClass
        Action: GObject.ObjectClass & {
            [Symbol.hasInstance](i: unknown): i is GObject.Object & { __: "action" }
        }
        Constraint: GObject.ObjectClass & {
            [Symbol.hasInstance](i: unknown): i is GObject.Object & { __: "constraint" }
        }
        LayoutManager: GObject.ObjectClass & {
            [Symbol.hasInstance](i: unknown): i is GObject.Object & { __: "layout_manager" }
        }
    }
}

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
        return newObject(element, props)
    }
    createText(string: string): GObject.Object {
        return St.Label.new(string)
    }
    prepareProps(_: CC, props: Record<string, unknown>): Record<string, unknown> {
        return props
    }
    setProperty(object: GObject.Object, key: string, value: unknown): void {
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
        if (setChildren in parent && typeof parent[setChildren] === "function") {
            if (parent[setChildren](children, prev)) return
        } else {
            for (const child of prev) {
                this.removeChild(parent, child)
            }
            for (const child of children) {
                this.appendChild(parent, child)
            }
        }

        for (const child of prev.filter((child) => !children.includes(child))) {
            this.destroyChild(parent, child)
        }
    }
    appendChild(parent: GObject.Object, child: GObject.Object): void {
        if (appendChild in parent && typeof parent[appendChild] === "function") {
            if (parent[appendChild](child)) return
        }

        if (parent instanceof Clutter.Actor) {
            if (child instanceof Clutter.Actor) {
                return parent.add_child(child)
            }
            if (child instanceof Clutter.Action) {
                return parent.add_action(child)
            }
            if (child instanceof Clutter.Constraint) {
                return parent.add_constraint(child)
            }
            if (child instanceof Clutter.LayoutManager) {
                return parent.set_layout_manager(child)
            }
        }

        throw Error(`cannot add ${child} to ${parent}`)
    }
    removeChild(parent: GObject.Object, child: GObject.Object): void {
        if (removeChild in parent && typeof parent[removeChild] === "function") {
            if (parent[removeChild](child)) return
        }

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
    }
    destroyChild(_: GObject.Object, child: GObject.Object): void {
        if (child instanceof Clutter.Actor) {
            child.destroy()
        }
    }
}

export function render(element: () => GnimNode, root?: GObject.Object) {
    return renderGnim(new GnomeRenderer(), element, root)
}
