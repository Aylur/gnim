import Gtk from "gi://Gtk?version=4.0"
import GObject from "gi://GObject"
import Fragment from "../jsx/Fragment.js"
import { configue, gtkType } from "../jsx/index.js"

const dummyBuilder = new Gtk.Builder()

function add(parent: Gtk.Buildable, child: GObject.Object, _: number) {
    const type = gtkType in child ? child[gtkType] as string : null
    parent.vfunc_add_child(dummyBuilder, child, type)
}

function remove(parent: GObject.Object, child: GObject.Object) {
    if ("set_child" in parent && typeof parent.set_child == "function") {
        return parent.set_child(null)
    }

    if (child instanceof Gtk.Widget) {
        // TODO: container types
        if (parent instanceof Gtk.Box) {
            return parent.remove(child)
        }
    }

    throw Error(`cannot remove ${child} from ${parent}`)
}

export const { addChild, intrinsicElements } = configue({
    intrinsicElements: {},
    addChild(parent, child, index = -1) {
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

        console.error(TypeError(`cannot add ${child} to ${parent}`))
    },
})

export { Fragment }
export { jsx, jsxs } from "../jsx/index.js"
