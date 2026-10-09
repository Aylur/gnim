import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import {
    appendChild,
    BaseRenderer,
    computed,
    isAccessor,
    MissingMethodError,
    prop,
    removeChild,
    render as renderGnim,
    setChildren,
    type CC,
    type CCProps,
    type GnimNode,
    type MaybeAccessor,
} from "gnim"
import { applyChildrenRules, applyRules, constructOnlyChild, getSlot, setSlot } from "./rules.js"

const dummyBuilder = new Gtk.Builder()
const cssProviders = new WeakMap<Gtk.Widget, Gtk.CssProvider>()

function setCss(widget: Gtk.Widget, css: string) {
    if (!css.includes("{") || !css.includes("}")) {
        css = css.trim().endsWith(";") ? `* { ${css} }` : `* { ${css}; }`
    }

    const ctx = widget.get_style_context()

    const prev = cssProviders.get(widget)
    if (prev) ctx.remove_provider(prev)

    const provider = new Gtk.CssProvider()
    provider.load_from_string(css)
    ctx.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
    cssProviders.set(widget, provider)
}

function flattenClassList(classList: unknown): MaybeAccessor<string> {
    if (typeof classList === "string") return classList
    if (isAccessor(classList)) return flattenClassList(classList())
    if (Array.isArray(classList)) return classList.map(flattenClassList).join(" ")
    return ""
}

export class GtkRenderer extends BaseRenderer {
    static instance: GtkRenderer | null = null

    static get() {
        if (!this.instance) this.instance = new GtkRenderer()
        return this.instance
    }

    constructObject(element: CC, props: Record<string, unknown>): GObject.Object {
        const { slot, ...rest } = props

        if (
            !rest.construct &&
            constructOnlyChild.some((k) => element === k || element.prototype instanceof k)
        ) {
            const child = this.resolveChild(rest.children as GnimNode, `${element.name}:child`)
            delete rest.children
            rest.child = child
        }

        const object = this.newObject(element, rest as Partial<CCProps<GObject.Object>>)

        if (typeof slot === "string") {
            setSlot(object, slot)
        }

        return object
    }

    createText(string: string): GObject.Object {
        return Gtk.Label.new(string)
    }

    prepareProps(klass: CC, props: Record<string, unknown>): Record<string, unknown> {
        if (klass.prototype instanceof Gtk.Widget && "class" in props) {
            const cn = props.class
            props.class = computed(() => flattenClassList(cn))
        }
        if (klass.prototype instanceof Gtk.Widget && "css" in props) {
            const css = props.css
            props.css = prop(css) // force it to an Accessor so it is applied, after construction
        }
        return props
    }

    setProperty(object: GObject.Object, key: string, value: unknown): void {
        if (object instanceof Gtk.Widget && key === "css" && typeof value === "string") {
            return setCss(object, value)
        }

        if (object instanceof Gtk.Widget && key === "class" && typeof value === "string") {
            return object.set_css_classes(value.split(/\s+/).filter((n) => n !== ""))
        }

        super.setProperty(object, key, value)
    }

    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void {
        const buildable = setChildren in parent || appendChild in parent || removeChild in parent

        if (
            !buildable &&
            applyChildrenRules(parent, children, prev, {
                append: (child) => this.appendChild(parent, child),
                remove: (child) => this.removeChild(parent, child),
            })
        ) {
            return
        }

        super.setChildren(parent, children, prev)
    }

    appendChild(parent: GObject.Object, child: GObject.Object): void {
        if (applyRules("append", parent, child)) return

        if (parent instanceof Gtk.Buildable) {
            return parent.vfunc_add_child(dummyBuilder, child, getSlot(child))
        }

        throw new MissingMethodError("appendChild", parent, child)
    }

    removeChild(parent: GObject.Object, child: GObject.Object): void {
        if (applyRules("remove", parent, child)) return

        // TODO: register every known .remove and .set_child as rules
        if (child instanceof Gtk.Widget) {
            // Most containers have a .remove()
            if ("remove" in parent && typeof parent.remove == "function") {
                return parent.remove(child)
            }

            // Most Bin-like containers have a .set_child()
            if ("set_child" in parent && typeof parent.set_child == "function") {
                return parent.set_child(null)
            }
        }

        throw new MissingMethodError("removeChild", parent, child)
    }

    disposeObject(object: GObject.Object): void {
        if (object instanceof Gtk.Window) {
            object.destroy()
        }
    }
}

export function render(element: () => GnimNode, root?: GObject.Object) {
    return renderGnim(GtkRenderer.get(), element, root)
}

export type ClassValue = string | number | null | boolean | undefined | ClassValue[]
export type ClassList = MaybeAccessor<ClassValue> | MaybeAccessor<ClassList[]>

declare module "gnim" {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace JSX {
        interface IntrinsicClassAttributes<T> {
            slot?: string
            css?: T extends Gtk.Widget ? MaybeAccessor<string> : never
            class?: T extends Gtk.Widget ? ClassList : never
        }
    }
}
