import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=3.0"
import {
    BaseRenderer,
    computed,
    isAccessor,
    MissingMethodError,
    prop,
    render as renderGnim,
    type CC,
    type CCProps,
    type GnimNode,
    type MaybeAccessor,
} from "gnim"

const slots = new WeakMap<GObject.Object, string>()
const FALLTHROUGH = false
const noop = () => {}

const dummyBuilder = new Gtk.Builder()
const encoder = new TextEncoder()
const cssProviders = new WeakMap<Gtk.Widget, Gtk.CssProvider>()

/**
 * @returns The `slot` that was set in JSX on `object`.
 */
export function getSlot(object: GObject.Object) {
    return slots.get(object) ?? null
}

export function setSlot(object: GObject.Object, slot: string) {
    slots.set(object, slot)
}

type Ctor<T> = abstract new (...args: never[]) => T

interface Rule<P = GObject.Object, C = GObject.Object> {
    parent: Ctor<P>
    child: Ctor<C>
    when?(parent: P, child: C): boolean
    append?(parent: P, child: C): void | typeof FALLTHROUGH
    remove?(parent: P, child: C): void | typeof FALLTHROUGH
}

function rule<P extends GObject.Object, C extends GObject.Object>(
    parent: Ctor<P>,
    child: Ctor<C>,
    impl: Omit<Rule<P, C>, "parent" | "child">,
): Rule {
    return { parent, child, ...impl }
}

function setCss(widget: Gtk.Widget, css: string) {
    if (!css.includes("{") || !css.includes("}")) {
        css = `* { ${css} }`
    }

    const ctx = widget.get_style_context()

    const prev = cssProviders.get(widget)
    if (prev) ctx.remove_provider(prev)

    const provider = new Gtk.CssProvider()
    provider.load_from_data(encoder.encode(css))
    ctx.add_provider(provider, Gtk.STYLE_PROVIDER_PRIORITY_USER)
    cssProviders.set(widget, provider)
}

function flattenClassList(classList: unknown): MaybeAccessor<string> {
    if (typeof classList === "string") return classList
    if (isAccessor(classList)) return flattenClassList(classList())
    if (Array.isArray(classList)) return classList.map(flattenClassList).join(" ")
    return ""
}

function isAdjustable(object: GObject.Object) {
    return GObject.Object.list_properties
        .call(object)
        .some((prop) => GObject.type_is_a(prop.value_type, Gtk.Adjustment))
}

export class GtkRenderer extends BaseRenderer {
    static instance: GtkRenderer | null = null

    static get() {
        if (!this.instance) this.instance = new GtkRenderer()
        return this.instance
    }

    private rules: readonly Rule[] = [
        rule(GObject.Object, Gtk.Adjustment, {
            when: (p) => isAdjustable(p),
            append: (p, c) => void Object.assign(p, { adjustment: c }),
            remove: noop,
        }),
        rule(Gtk.Stack, Gtk.Widget, {
            when: (_, c) => getSlot(c) === "named" && !!c.name,
            append: (p, c) => p.add_named(c, c.name),
        }),
        rule(Gtk.Application, Gtk.Window, {
            append: (p, c) => p.add_window(c),
            remove: (p, c) => p.remove_window(c),
        }),
        rule(Gtk.TextView, Gtk.TextBuffer, {
            append: (p, c) => p.set_buffer(c),
            remove: (p) => p.set_buffer(null),
        }),
        rule(Gtk.Container, Gtk.Widget, {
            remove: (p, c) => p.remove(c),
        }),
    ]

    private applyRules(
        op: "append" | "remove",
        parent: GObject.Object,
        child: GObject.Object,
    ): boolean {
        for (const r of this.rules) {
            const fn = r[op]
            if (!fn || !(parent instanceof r.parent) || !(child instanceof r.child)) continue
            if (r.when && !r.when(parent, child)) continue
            if (fn(parent, child) !== FALLTHROUGH) return true
        }
        return FALLTHROUGH
    }

    constructObject(element: CC, props: Record<string, unknown>): GObject.Object {
        const { slot, ...rest } = props

        if (element.prototype instanceof Gtk.Widget) {
            rest.visible ??= true
        }

        const object = this.newObject(element, rest as Partial<CCProps<GObject.Object>>)

        if (typeof slot === "string") {
            setSlot(object, slot)
        }

        return object
    }

    createText(label: string): GObject.Object {
        return new Gtk.Label({ label, visible: true })
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
            const ctx = object.get_style_context()

            for (const name of ctx.list_classes()) {
                ctx.remove_class(name)
            }

            for (const name of value.split(/\s+/).filter((n) => n !== "")) {
                ctx.add_class(name)
            }
            return
        }

        super.setProperty(object, key, value)
    }

    appendChild(parent: GObject.Object, child: GObject.Object): void {
        if (this.applyRules("append", parent, child)) return

        if (parent instanceof Gtk.Buildable) {
            return parent.vfunc_add_child(dummyBuilder, child, getSlot(child))
        }

        throw new MissingMethodError("appendChild", parent, child)
    }

    removeChild(parent: GObject.Object, child: GObject.Object): void {
        if (this.applyRules("remove", parent, child)) return

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
