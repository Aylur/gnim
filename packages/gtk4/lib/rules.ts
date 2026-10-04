import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"

// optional
const Adw = await import("gi://Adw?version=1").then((mod) => mod.default).catch(() => null)

const slots = new WeakMap<GObject.Object, string>()
const fallthrough = false
const noop = () => {}

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

interface ChildRule<P = GObject.Object, C = GObject.Object> {
    parent: Ctor<P>
    child: Ctor<C>
    when?(parent: P, child: C): boolean
    append?(parent: P, child: C): void | typeof fallthrough
    remove?(parent: P, child: C): void | typeof fallthrough
}

function rule<P extends GObject.Object, C extends GObject.Object>(
    parent: Ctor<P>,
    child: Ctor<C>,
    impl: Omit<ChildRule<P, C>, "parent" | "child">,
): ChildRule {
    return { parent, child, ...impl } as ChildRule
}

export function applyRules(
    op: "append" | "remove",
    parent: GObject.Object,
    child: GObject.Object,
): boolean {
    for (const r of rules) {
        const fn = r[op]
        if (!fn || !(parent instanceof r.parent) || !(child instanceof r.child)) continue
        if (r.when && !r.when(parent, child)) continue
        if (fn(parent, child) !== fallthrough) return true
    }
    return fallthrough
}

interface ChildOps {
    append(child: GObject.Object): void
    remove(child: GObject.Object): void
}

interface ChildrenRule<P = GObject.Object> {
    parent: Ctor<P>
    children(
        parent: P,
        children: GObject.Object[],
        prev: GObject.Object[],
        ops: ChildOps,
    ): void | typeof fallthrough
}

function childrenRule<P extends GObject.Object>(
    parent: Ctor<P>,
    children: ChildrenRule<P>["children"],
): ChildrenRule {
    return { parent, children } as ChildrenRule
}

export function applyChildrenRules(
    parent: GObject.Object,
    children: GObject.Object[],
    prev: GObject.Object[],
    ops: ChildOps,
): boolean {
    for (const r of childrenRules) {
        if (!(parent instanceof r.parent)) continue
        if (r.children(parent, children, prev, ops) !== fallthrough) return true
    }
    return fallthrough
}

function keepChildren(
    _: GObject.Object,
    children: GObject.Object[],
    prev: GObject.Object[],
    { append, remove }: ChildOps,
) {
    for (const child of prev) {
        if (!children.includes(child)) remove(child)
    }
    for (const child of children) {
        if (!prev.includes(child)) append(child)
    }
}

// workaround for `<Stack><StackPage /></Stack>`:
// stacks clear `page.child` when the page is removed,
// so a page that is removed can't be appended again
export const childrenRules: ChildrenRule[] = [
    childrenRule(Gtk.Stack, keepChildren),
    ...(Adw
        ? [
              childrenRule(Adw.ViewStack, keepChildren),
              childrenRule(Adw.Leaflet, keepChildren),
              childrenRule(Adw.Squeezer, keepChildren),
          ]
        : []),
]

export const constructOnlyChild: ReadonlyArray<Ctor<GObject.Object>> = [
    Gtk.StackPage,
    Gtk.NotebookPage,
    Gtk.AssistantPage,
    ...(Adw ? ([Adw.ViewStackPage, Adw.LeafletPage, Adw.SqueezerPage] as const) : []),
]

const centerBoxSlots = ["start", "center", "end"]

function assistantPageNum(assistant: Gtk.Assistant, child: Gtk.Widget) {
    for (let i = 0; i < assistant.get_n_pages(); i++) {
        if (assistant.get_nth_page(i) === child) return i
    }
    return -1
}

export const rules: ChildRule[] = [
    ...(Adw
        ? [
              rule(Adw.BreakpointBin, Adw.Breakpoint, {
                  remove: (p, c) => p.remove_breakpoint(c),
              }),
              rule(Adw.SplitButton, Gtk.Popover, {
                  remove: (p, c) => p.popover === c && p.set_popover(null),
              }),
              rule(Adw.SplitButton, Gio.MenuModel, {
                  append: (p, c) => p.set_menu_model(c),
                  remove: (p, c) => p.menuModel === c && p.set_menu_model(null),
              }),
              rule(Adw.Window, Gtk.Widget, {
                  remove: (p, c) => p.content === c && p.set_content(null),
              }),
              rule(Adw.ApplicationWindow, Gtk.Widget, {
                  remove: (p, c) => p.content === c && p.set_content(null),
              }),
              rule(Adw.NavigationSplitView, Gtk.Widget, {
                  remove(p, c) {
                      if (p.sidebar === c) return p.set_sidebar(null)
                      if (p.content === c) return p.set_content(null)
                      return false
                  },
              }),
              rule(Adw.OverlaySplitView, Gtk.Widget, {
                  remove(p, c) {
                      if (p.sidebar === c) return p.set_sidebar(null)
                      if (p.content === c) return p.set_content(null)
                      return false
                  },
              }),
              rule(Adw.ViewStack, Gtk.Widget, {
                  when: (_, c) => getSlot(c) === "named" && !!c.name,
                  append: (p, c) => void p.add_named(c, c.name),
              }),
              rule(Adw.ViewStack, Adw.ViewStackPage, {
                  remove: (p, c) => p.remove(c.get_child()),
              }),
              rule(Adw.Leaflet, Adw.LeafletPage, {
                  remove: (p, c) => p.remove(c.get_child()),
              }),
              rule(Adw.Squeezer, Adw.SqueezerPage, {
                  remove: (p, c) => p.remove(c.get_child()),
              }),
              rule(Adw.SpinRow, Gtk.Adjustment, {
                  append: (p, c) => p.set_adjustment(c),
                  remove: noop,
              }),
          ]
        : []),
    rule(Gtk.Range, Gtk.Adjustment, {
        append: (p, c) => p.set_adjustment(c),
        remove: noop,
    }),
    rule(Gtk.Scrollbar, Gtk.Adjustment, {
        append: (p, c) => p.set_adjustment(c),
        remove: noop,
    }),
    rule(Gtk.ScaleButton, Gtk.Adjustment, {
        append: (p, c) => p.set_adjustment(c),
        remove: noop,
    }),
    rule(Gtk.SpinButton, Gtk.Adjustment, {
        append: (p, c) => p.set_adjustment(c),
        remove: noop,
    }),
    rule(Gtk.CellRendererSpin, Gtk.Adjustment, {
        append: (p, c) => void (p.adjustment = c),
        remove: noop,
    }),
    rule(Gtk.Widget, Gtk.EventController, {
        remove: (p, c) => p.remove_controller(c),
    }),
    rule(Gtk.Stack, Gtk.Widget, {
        when: (_, c) => getSlot(c) === "named" && !!c.name,
        append: (p, c) => void p.add_named(c, c.name),
    }),
    rule(Gtk.Stack, Gtk.StackPage, {
        remove: (p, c) => p.remove(c.get_child()),
    }),
    rule(Gtk.Notebook, Gtk.NotebookPage, {
        remove(p, c) {
            const pageNum = p.page_num(c.get_child())
            if (pageNum === -1) return false
            p.remove_page(pageNum)
        },
    }),
    rule(Gtk.Assistant, Gtk.AssistantPage, {
        remove(p, c) {
            const pageNum = assistantPageNum(p, c.get_child())
            if (pageNum === -1) return false
            p.remove_page(pageNum)
        },
    }),
    rule(Gtk.MenuButton, Gtk.Popover, {
        append: (p, c) => p.set_popover(c),
        remove: (p, c) => p.popover === c && p.set_popover(null),
    }),
    ...(Gtk.PopoverBin
        ? [
              rule(Gtk.PopoverBin, Gtk.Popover, {
                  append: (p, c) => p.set_popover(c),
                  remove: (p, c) => p.popover === c && p.set_popover(null),
              }),
          ]
        : []),
    rule(Gtk.MenuButton, Gio.MenuModel, {
        append: (p, c) => p.set_menu_model(c),
        remove: (p) => p.set_menu_model(null),
    }),
    rule(Gtk.PopoverMenu, Gio.MenuModel, {
        append: (p, c) => p.set_menu_model(c),
        remove: (p) => p.set_menu_model(null),
    }),
    rule(Gtk.Application, Gtk.Window, {
        append: (p, c) => p.add_window(c),
        remove: (p, c) => p.remove_window(c),
    }),
    rule(Gtk.TextView, Gtk.TextBuffer, {
        append: (p, c) => p.set_buffer(c),
        remove: (p, c) => p.buffer === c && p.set_buffer(null),
    }),
    rule(Gtk.CenterBox, Gtk.Widget, {
        when: (_, c) => !centerBoxSlots.includes(getSlot(c) ?? ""),
        append(_, c) {
            if (!getSlot(c)) {
                console.warn("Trying to append child to Gtk.CenterBox without a specified slot")
            } else {
                console.warn(
                    `Invalid Gtk.CenterBox child slot: has to be one of "start", "center", "end"`,
                )
            }
        },
    }),
    rule(Gtk.CenterBox, Gtk.Widget, {
        remove(p, c) {
            switch (getSlot(c)) {
                case "start":
                    return p.set_start_widget(null)
                case "center":
                    return p.set_center_widget(null)
                case "end":
                    return p.set_end_widget(null)
            }
            return false
        },
    }),
    rule(Gtk.Paned, Gtk.Widget, {
        remove(p, c) {
            switch (getSlot(c)) {
                case "start":
                    return p.set_start_child(null)
                case "end":
                    return p.set_end_child(null)
            }
            return false
        },
    }),
    rule(Gtk.Overlay, Gtk.Widget, {
        remove(p, c) {
            if (getSlot(c) === "overlay") return p.remove_overlay(c)
            p.set_child(null)
        },
    }),
    rule(Gtk.Notebook, Gtk.Widget, {
        remove(p, c) {
            const pageNum = p.page_num(c)
            if (pageNum === -1) return false
            p.remove_page(pageNum)
        },
    }),
]
