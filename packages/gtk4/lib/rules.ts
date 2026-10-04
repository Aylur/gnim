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

function positionOf(model: Gio.ListModel, item: GObject.Object) {
    for (let i = 0; i < model.get_n_items(); i++) {
        if (model.get_item(i) === item) return i
    }
    return -1
}

function emptyWidget() {
    return new Gtk.Box({ visible: false })
}

function notebookPageOfTab(notebook: Gtk.Notebook, tab: Gtk.Widget) {
    for (let i = 0; i < notebook.get_n_pages(); i++) {
        const page = notebook.get_nth_page(i)
        if (page && notebook.get_tab_label(page) === tab) return page
    }
    return null
}

export const rules: ChildRule[] = [
    ...(Adw
        ? [
              // Adw.Dialog, Adw.Window and Adw.ApplicationWindow have no `remove_breakpoint`
              rule(Adw.Dialog, Adw.Breakpoint, { remove: noop }),
              rule(Adw.Window, Adw.Breakpoint, { remove: noop }),
              rule(Adw.ApplicationWindow, Adw.Breakpoint, { remove: noop }),
              // Adw.ShortcutsDialog and Adw.ShortcutsSection have no remove API
              rule(Adw.ShortcutsDialog, Adw.ShortcutsSection, { remove: noop }),
              rule(Adw.ShortcutsSection, Adw.ShortcutsItem, { remove: noop }),
              // Adw.Layout:content is construct-only
              rule(Adw.Layout, Gtk.Widget, { remove: noop }),
              rule(Adw.MultiLayoutView, Adw.Layout, {
                  remove: (p, c) => p.remove_layout(c),
              }),
              rule(Adw.MultiLayoutView, Gtk.Widget, {
                  remove(p, c) {
                      const slot = getSlot(c)
                      if (!slot || p.get_child(slot) !== c) return false
                      p.set_child(slot, emptyWidget())
                  },
              }),
              rule(Adw.PreferencesGroup, Gtk.Widget, {
                  remove: (p, c) => (p.headerSuffix === c ? p.set_header_suffix(null) : false),
              }),
              rule(Adw.BottomSheet, Gtk.Widget, {
                  remove(p, c) {
                      if (p.content === c) return p.set_content(null)
                      if (p.sheet === c) return p.set_sheet(null)
                      if (p.bottomBar === c) return p.set_bottom_bar(null)
                      return false
                  },
              }),
              rule(Adw.Flap, Gtk.Widget, {
                  remove(p, c) {
                      if (p.get_content() === c) return p.set_content(null)
                      if (p.get_flap() === c) return p.set_flap(null)
                      if (p.get_separator() === c) return p.set_separator(null)
                      return false
                  },
              }),
              rule(Adw.TabView, Gtk.Widget, {
                  append: (p, c) => void p.append(c),
                  remove(p, c) {
                      const page = p.get_page(c)
                      if (!page) return false
                      p.close_page(page)
                  },
              }),
              rule(Adw.Sidebar, Adw.SidebarSection, {
                  remove: (p, c) => p.remove(c),
              }),
              rule(Adw.SidebarSection, Adw.SidebarItem, {
                  remove: (p, c) => p.remove(c),
              }),
              rule(Adw.ToggleGroup, Adw.Toggle, {
                  remove: (p, c) => p.remove(c),
              }),
              rule(Adw.ToastOverlay, Adw.Toast, {
                  append: (p, c) => p.add_toast(c),
                  remove: (_, c) => c.dismiss(),
              }),
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
            switch (getSlot(c)) {
                case "tab": {
                    // the tab label goes away with its page
                    const page = notebookPageOfTab(p, c)
                    if (page) p.set_tab_label(page, null)
                    return
                }
                case "action-start":
                    return p.set_action_widget(emptyWidget(), Gtk.PackType.START)
                case "action-end":
                    return p.set_action_widget(emptyWidget(), Gtk.PackType.END)
            }
            return false
        },
    }),
    rule(Gtk.Notebook, Gtk.Widget, {
        remove(p, c) {
            const pageNum = p.page_num(c)
            if (pageNum === -1) return false
            p.remove_page(pageNum)
        },
    }),
    rule(Gtk.ListBox, Gtk.Widget, {
        when: (_, c) => getSlot(c) === "placeholder",
        remove: (p) => p.set_placeholder(null),
    }),
    // non-row children are wrapped in an implicit Gtk.ListBoxRow
    rule(Gtk.ListBox, Gtk.Widget, {
        when: (p, c) => !(c instanceof Gtk.ListBoxRow) && c.get_parent()?.get_parent() === p,
        remove: (p, c) => p.remove(c.get_parent()!),
    }),
    rule(Gtk.InfoBar, Gtk.Widget, {
        remove(p, c) {
            // Buildable appends action widgets to the action area without response data,
            // which makes `remove_action_widget` segfault
            if (getSlot(c) === "action") return (c.get_parent() as Gtk.Box | null)?.remove(c)
            p.remove_child(c)
        },
    }),
    rule(Gtk.TextTagTable, Gtk.TextTag, {
        remove: (p, c) => p.remove(c),
    }),
    rule(Gtk.ColumnView, Gtk.ColumnViewColumn, {
        remove: (p, c) => p.remove_column(c),
    }),
    rule(Gtk.MultiFilter, Gtk.Filter, {
        remove(p, c) {
            const position = positionOf(p, c)
            if (position === -1) return false
            p.remove(position)
        },
    }),
    rule(Gtk.MultiSorter, Gtk.Sorter, {
        remove(p, c) {
            const position = positionOf(p, c)
            if (position === -1) return false
            p.remove(position)
        },
    }),
    rule(Gtk.ShortcutController, Gtk.Shortcut, {
        remove: (p, c) => p.remove_shortcut(c),
    }),
    rule(Gtk.TreeView, Gtk.TreeViewColumn, {
        remove: (p, c) => void p.remove_column(c),
    }),
    rule(Gtk.CellArea, Gtk.CellRenderer, {
        remove: (p, c) => p.remove(c),
    }),
    rule(Gtk.CellLayout as unknown as Ctor<Gtk.CellLayout & GObject.Object>, Gtk.CellRenderer, {
        remove: (p, c) => p.get_area()?.remove(c),
    }),
    // ShortcutsSection and ShortcutsWindow pack their children into internal containers
    rule(Gtk.ShortcutsSection, Gtk.ShortcutsGroup, {
        remove: (_, c) => (c.get_parent() as Gtk.Box | null)?.remove(c),
    }),
    rule(Gtk.ShortcutsWindow, Gtk.ShortcutsSection, {
        remove: (_, c) => (c.get_parent() as Gtk.Stack | null)?.remove(c),
    }),
    rule(Gtk.WindowGroup, Gtk.Window, {
        append: (p, c) => p.add_window(c),
        remove: (p, c) => p.remove_window(c),
    }),
]
