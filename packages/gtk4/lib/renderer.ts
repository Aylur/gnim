import Gio from "gi://Gio?version=2.0"
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

// optional
const Adw = await import("gi://Adw?version=1").then((mod) => mod.default).catch(() => null)

const slots = new WeakMap<GObject.Object, string>()
const FALLTHROUGH = false
const noop = () => {}

const dummyBuilder = new Gtk.Builder()
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

function tabPageOf(pages: Gio.ListModel, child: Gtk.Widget) {
    for (let i = 0; i < pages.get_n_items(); i++) {
        const page = pages.get_item(i) as (GObject.Object & { child: Gtk.Widget }) | null
        if (page?.child === child) return page
    }
    return null
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

export class GtkRenderer extends BaseRenderer {
    static #instance: GtkRenderer | null = null

    static get() {
        if (!this.#instance) this.#instance = new GtkRenderer()
        return this.#instance
    }

    private preconstructChild: ReadonlyArray<Ctor<GObject.Object>> = [
        Gtk.StackPage,
        Gtk.NotebookPage,
        Gtk.AssistantPage,
        ...(Adw
            ? ([Adw.ViewStackPage, Adw.LeafletPage, Adw.SqueezerPage, Adw.TabPage] as const)
            : []),
    ]

    private stacklike: ReadonlyArray<Ctor<GObject.Object>> = [
        Gtk.Stack,
        ...(Adw ? [Adw.ViewStack, Adw.Leaflet, Adw.Squeezer, Adw.TabView] : []),
    ]

    private rules: readonly Rule[] = [
        ...(Adw
            ? [
                  rule(Adw.Dialog, Adw.Breakpoint, { remove: noop }),
                  rule(Adw.Window, Adw.Breakpoint, { remove: noop }),
                  rule(Adw.ApplicationWindow, Adw.Breakpoint, { remove: noop }),
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
                  rule(Adw.TabView, Adw.TabPage, {
                      remove(p, c) {
                          if (positionOf(p.pages, c) === -1) return
                          p.set_page_pinned(c, false)
                          p.close_page(c)
                      },
                  }),
                  rule(Adw.TabView, Gtk.Widget, {
                      remove: (p, c) => {
                          const page = tabPageOf(p.pages, c)
                          if (page) this.applyRules("remove", p, page)
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
            when: (_, c) => !["start", "center", "end"].includes(getSlot(c) ?? ""),
            append(_, c) {
                if (!getSlot(c)) {
                    logError(
                        Error("Trying to append child to Gtk.CenterBox without a specified slot"),
                    )
                } else {
                    logError(
                        Error(
                            `Invalid Gtk.CenterBox child slot: has to be one of "start", "center", "end"`,
                        ),
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

        if (
            !rest.construct &&
            this.preconstructChild.some((k) => element === k || element.prototype instanceof k)
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
        const stacklike = this.stacklike.find((s) => parent instanceof s)

        if (!buildable && stacklike) {
            for (const child of prev) {
                if (!children.includes(child)) this.removeChild(parent, child)
            }
            for (const child of children) {
                if (!prev.includes(child)) this.appendChild(parent, child)
            }
        } else {
            super.setChildren(parent, children, prev)
        }
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
            css?: T extends Pick<Gtk.Widget, "get_style_context"> ? MaybeAccessor<string> : never
            class?: T extends Pick<Gtk.Widget, "get_style_context"> ? ClassList : never
        }
    }
}
