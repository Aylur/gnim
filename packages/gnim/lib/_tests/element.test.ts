import GObject from "gi://GObject?version=2.0"
import Gio from "gi://Gio?version=2.0"
import { describe, expect, it, vi } from "vitest"
import type { CC, CCProps, GnimNode } from "../jsx/element.js"
import { For, Fragment, Portal, With, jsx } from "../jsx/element.js"
import {
    computed,
    createContext,
    createState,
    effect,
    getScope,
    onCleanup,
    onMount,
    subscribe,
    type Accessor,
} from "../jsx/reactive.js"
import { BaseRenderer, render } from "../jsx/render.js"
import { connectSignal } from "../jsx/store.js"

const emit = GObject.signal_emit_by_name
const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

class Widget extends GObject.Object {
    label = ""
    children: Widget[] = []
    destroyed = false

    constructor(props: Record<string, unknown> = {}) {
        super()
        Object.assign(this, props)
    }
}

class Box extends Widget {}

class TestRenderer extends BaseRenderer {
    resolveTag(tag: string): CC {
        if (tag === "box") return Box
        return super.resolveTag(tag) as CC
    }
    constructObject(klass: CC, props: Record<string, unknown>) {
        return this.newObject(klass, props as CCProps<GObject.Object>)
    }
    createText(text: string) {
        return new Widget({ label: text })
    }
    appendChild(parent: Widget, child: Widget) {
        parent.children.push(child)
    }
    removeChild(parent: Widget, child: Widget) {
        parent.children = parent.children.filter((ch) => ch !== child)
    }
    disposeObject(object: Widget) {
        object.destroyed = true
    }
}

const renderer = new TestRenderer()

const renderTree = (element: () => GnimNode, root?: GObject.Object) =>
    render(renderer, element, root)

const labels = (widget: Widget) => widget.children.map((child) => child.label)

describe("render", () => {
    it("constructs class components with their props and appends them to the root", () => {
        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { label: "hello" }), root)

        expect(root.children).toHaveLength(1)
        expect(root.children[0]).toBeInstanceOf(Widget)
        expect(root.children[0].label).toBe("hello")

        dispose()
    })

    it("renders strings and numbers as text nodes", () => {
        const root = new Box()
        const dispose = renderTree(() => ["hello", 42], root)

        expect(labels(root)).toEqual(["hello", "42"])

        dispose()
    })

    it("renders nothing for null, undefined, false, and empty strings", () => {
        const root = new Box()
        const dispose = renderTree(() => [null, undefined, false, ""], root)

        expect(root.children).toHaveLength(0)

        dispose()
    })

    it("warns and renders nothing for a true literal", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

        const root = new Box()
        const dispose = renderTree(() => true, root)

        expect(root.children).toHaveLength(0)
        expect(warn).toHaveBeenCalled()

        warn.mockRestore()
        dispose()
    })

    it("resolves string tags through the renderer", () => {
        const root = new Box()
        const dispose = renderTree(() => jsx("box", { label: "tagged" }), root)

        expect(root.children[0]).toBeInstanceOf(Box)
        expect(root.children[0].label).toBe("tagged")

        dispose()
    })

    it("invokes function components with their props", () => {
        function Labeled({ text }: { text: string }): GnimNode {
            return jsx(Widget, { label: text })
        }

        const root = new Box()
        const dispose = renderTree(() => jsx(Labeled, { text: "from-fc" }), root)

        expect(labels(root)).toEqual(["from-fc"])

        dispose()
    })

    it("appends nested children to their parent", () => {
        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Box, {
                    children: [jsx(Widget, { label: "a" }), jsx(Widget, { label: "b" })],
                }),
            root,
        )

        expect(root.children).toHaveLength(1)
        expect(labels(root.children[0])).toEqual(["a", "b"])

        dispose()
    })

    it("calls ref with the constructed instance", () => {
        const ref = vi.fn()

        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { ref }), root)

        expect(ref).toHaveBeenCalledTimes(1)
        expect(ref).toHaveBeenCalledWith(root.children[0])

        dispose()
    })

    it("connects onEvent props as signal handlers and disconnects them on dispose", () => {
        const handler = vi.fn()

        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { onClicked: handler }), root)
        const widget = root.children[0]

        emit(widget, "clicked", 1, 2)
        expect(handler).toHaveBeenCalledTimes(1)
        expect(handler).toHaveBeenCalledWith(widget, 1, 2)

        dispose()
        emit(widget, "clicked", 1, 2)
        expect(handler).toHaveBeenCalledTimes(1)
    })

    it("does not treat lowercase on* props as signal handlers", () => {
        const [onto, setOnto] = createState("initial")

        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { online: true, onto }), root)
        const widget = root.children[0] as Widget & { online: boolean; onto: string }

        expect(widget.online).toBe(true)
        expect(widget.onto).toBe("initial")

        setOnto("updated")
        expect(widget.onto).toBe("updated")

        dispose()
    })

    it("does not treat non-function on* props as signal handlers", () => {
        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { onDemand: 5, onDuty: "yes" }), root)
        const widget = root.children[0] as Widget & { onDemand: number; onDuty: string }

        expect(widget.onDemand).toBe(5)
        expect(widget.onDuty).toBe("yes")

        dispose()
    })

    it("converts camel cased and detailed signal prop names", () => {
        const onNotify = vi.fn()
        const onDetail = vi.fn()

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Widget, {
                    "onNotifyLabel": onNotify,
                    "onNotify:label": onNotify,
                    "onItemsChanged:query": onDetail,
                }),
            root,
        )
        const widget = root.children[0]

        emit(widget, "notify::label")
        expect(onNotify).toHaveBeenCalledTimes(2)

        emit(widget, "items-changed::query")
        expect(onDetail).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("applies accessor props and keeps them in sync until disposed", () => {
        const [label, setLabel] = createState("initial")

        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { label }), root)
        const widget = root.children[0]

        expect(widget.label).toBe("initial")

        setLabel("updated")
        expect(widget.label).toBe("updated")

        dispose()
        setLabel("ignored")
        expect(widget.label).toBe("updated")
    })

    it("uses the construct prop in place of the constructor", () => {
        const widget = new Widget()

        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, { construct: widget, label: "set" }), root)

        expect(root.children[0]).toBe(widget)
        expect(widget.label).toBe("set")

        dispose()
    })

    it("removes and destroys mounted children when disposed", () => {
        const root = new Box()
        const dispose = renderTree(() => jsx(Widget, {}), root)
        const widget = root.children[0]

        dispose()

        expect(root.children).toHaveLength(0)
        expect(widget.destroyed).toBe(true)
    })

    it("runs each widget's cleanups before destroying it, innermost-first", () => {
        const order: string[] = []

        // records the order of ref cleanups and of destructions
        const track = (name: string) => (self: Widget) => {
            let destroyed = false
            Object.defineProperty(self, "destroyed", {
                get: () => destroyed,
                set: (value: boolean) => {
                    destroyed = value
                    if (value) order.push(`destroy:${name}`)
                },
            })
            onCleanup(() => order.push(`cleanup:${name}`))
        }

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Widget, {
                    ref: track("third"),
                    children: jsx(Widget, {
                        ref: track("second"),
                        children: jsx(Widget, {
                            ref: track("first"),
                        }),
                    }),
                }),
            root,
        )

        dispose()

        expect(order).toEqual([
            "cleanup:first",
            "destroy:first",
            "cleanup:second",
            "destroy:second",
            "cleanup:third",
            "destroy:third",
        ])
    })

    it("constructs nested widgets top-down and appends them to their parents bottom-up", () => {
        const order: string[] = []

        // records the children appended to a widget by name
        const recordAppends = (widget: Widget) => {
            widget.children.push = (...appended: Widget[]) => {
                for (const child of appended) order.push(`append:${child.label}`)
                return Array.prototype.push.apply(widget.children, appended)
            }
        }

        // `ref` runs right after construction, before children are mounted
        const track = (name: string) => (self: Widget) => {
            order.push(`construct:${name}`)
            recordAppends(self)
        }

        const root = new Box()
        recordAppends(root)

        const dispose = renderTree(
            () =>
                jsx(Widget, {
                    label: "outer",
                    ref: track("outer"),
                    children: jsx(Widget, {
                        label: "middle",
                        ref: track("middle"),
                        children: jsx(Widget, {
                            label: "inner",
                            ref: track("inner"),
                        }),
                    }),
                }),
            root,
        )

        expect(order).toEqual([
            "construct:outer",
            "construct:middle",
            "construct:inner",
            "append:inner",
            "append:middle",
            "append:outer",
        ])

        dispose()
    })
})

describe("<Fragment />", () => {
    it("returns its children as a flat array", () => {
        const a = new Widget()
        const b = new Widget()

        const result = jsx(Fragment, { children: [a, b] })

        expect(Array.isArray(result)).toBe(true)
        expect(result).toEqual([a, b])
    })

    it("wraps a single child in an array", () => {
        const child = new Widget()
        expect(jsx(Fragment, { children: child })).toEqual([child])
    })

    it("renders grouped children without a wrapper node", () => {
        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Fragment, {
                    children: [jsx(Widget, { label: "a" }), jsx(Widget, { label: "b" })],
                }),
            root,
        )

        expect(labels(root)).toEqual(["a", "b"])

        dispose()
    })

    it("flattens deeply nested fragments in order", () => {
        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Fragment, {
                    children: [
                        jsx(Widget, { label: "a" }),
                        jsx(Fragment, {
                            children: [
                                jsx(Widget, { label: "b" }),
                                jsx(Fragment, {
                                    children: [
                                        jsx(Fragment, { children: jsx(Widget, { label: "c" }) }),
                                        jsx(Widget, { label: "d" }),
                                    ],
                                }),
                            ],
                        }),
                        jsx(Widget, { label: "e" }),
                    ],
                }),
            root,
        )

        expect(labels(root)).toEqual(["a", "b", "c", "d", "e"])

        dispose()
    })

    it("renders text and skips empty children inside nested fragments", () => {
        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Fragment, {
                    children: [
                        null,
                        jsx(Fragment, {
                            children: [
                                "text",
                                false,
                                jsx(Fragment, { children: [42, "", jsx(Widget, { label: "w" })] }),
                            ],
                        }),
                        undefined,
                    ],
                }),
            root,
        )

        expect(labels(root)).toEqual(["text", "42", "w"])

        dispose()
    })

    it("removes and destroys deeply nested fragment children when disposed", () => {
        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(Fragment, {
                    children: [
                        jsx(Widget, { label: "a" }),
                        jsx(Fragment, {
                            children: jsx(Fragment, { children: jsx(Widget, { label: "b" }) }),
                        }),
                    ],
                }),
            root,
        )
        const widgets = [...root.children]

        expect(widgets).toHaveLength(2)

        dispose()

        expect(root.children).toHaveLength(0)
        expect(widgets.every((widget) => widget.destroyed)).toBe(true)
    })
})

describe("<With />", () => {
    it("renders the child derived from the current value", () => {
        const [value] = createState("a")

        const root = new Box()
        const dispose = renderTree(
            () => jsx(With, { value, children: (v: string) => jsx(Widget, { label: v }) }),
            root,
        )

        expect(labels(root)).toEqual(["a"])

        dispose()
    })

    it("swaps the child when the value changes", async () => {
        const [value, setValue] = createState("a")

        const root = new Box()
        const dispose = renderTree(
            () => jsx(With, { value, children: (v: string) => jsx(Widget, { label: v }) }),
            root,
        )
        const first = root.children[0]

        setValue("b")
        await flush()

        expect(labels(root)).toEqual(["b"])
        expect(root.children[0]).not.toBe(first)
        expect(first.destroyed).toBe(true)

        dispose()
    })

    it("keeps the child when the value does not change", async () => {
        const [value, setValue] = createState("a")

        const root = new Box()
        const dispose = renderTree(
            () => jsx(With, { value, children: (v: string) => jsx(Widget, { label: v }) }),
            root,
        )
        const first = root.children[0]

        setValue("a")
        await flush()

        expect(root.children[0]).toBe(first)

        dispose()
    })

    it("disposes the previous child's scope when swapping", async () => {
        const cleanup = vi.fn()
        const [value, setValue] = createState("a")

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(With, {
                    value,
                    children: (v: string) => {
                        onCleanup(cleanup)
                        return jsx(Widget, { label: v })
                    },
                }),
            root,
        )

        expect(cleanup).not.toHaveBeenCalled()

        setValue("b")
        await flush()
        expect(cleanup).toHaveBeenCalledTimes(1)

        dispose()
        expect(cleanup).toHaveBeenCalledTimes(2)
    })

    it("swaps every element of a nested fragment child when the value changes", async () => {
        const [value, setValue] = createState("a")

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(With, {
                    value,
                    children: (v: string) =>
                        jsx(Fragment, {
                            children: [
                                jsx(Widget, { label: `${v}:1` }),
                                jsx(Fragment, { children: jsx(Widget, { label: `${v}:2` }) }),
                            ],
                        }),
                }),
            root,
        )

        expect(labels(root)).toEqual(["a:1", "a:2"])
        const previous = [...root.children]

        setValue("b")
        await flush()

        expect(labels(root)).toEqual(["b:1", "b:2"])
        expect(previous.every((widget) => widget.destroyed)).toBe(true)

        dispose()

        expect(root.children).toHaveLength(0)
    })
})

describe("<For />", () => {
    it("renders a child for each item in order", () => {
        const [items] = createState(["a", "b", "c"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) => jsx(Widget, { label: item }),
                }),
            root,
        )

        expect(labels(root)).toEqual(["a", "b", "c"])

        dispose()
    })

    it("exposes each item's index as an accessor", () => {
        const [items] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string, index: Accessor<number>) =>
                        jsx(Widget, { label: index.as((i) => `${item}:${i}`) }),
                }),
            root,
        )

        expect(labels(root)).toEqual(["a:0", "b:1"])

        dispose()
    })

    it("keeps each item's index state in sync with its position", async () => {
        const indices = new Map<string, Accessor<number>>()
        const mkChild = vi.fn((item: string, index: Accessor<number>) => {
            indices.set(item, index)
            return jsx(Widget, { label: item })
        })
        const indexOf = (item: string) => indices.get(item)?.()

        const [items, setItems] = createState(["a", "b", "c"])

        const root = new Box()
        const dispose = renderTree(() => jsx(For, { each: items, children: mkChild }), root)

        expect(indexOf("a")).toBe(0)
        expect(indexOf("b")).toBe(1)
        expect(indexOf("c")).toBe(2)

        // Removing an item shifts the indices of the items after it down.
        setItems(["b", "c"])
        await flush()

        expect(indexOf("b")).toBe(0)
        expect(indexOf("c")).toBe(1)

        // Inserting an item at the front shifts the existing indices up.
        setItems(["x", "b", "c"])
        await flush()

        expect(indexOf("x")).toBe(0)
        expect(indexOf("b")).toBe(1)
        expect(indexOf("c")).toBe(2)

        // The index is updated in place: memoized children are not re-created.
        expect(mkChild).toHaveBeenCalledTimes(4) // a, b, c, x

        dispose()
    })

    it("notifies index subscribers only when an item's position changes", async () => {
        const indices = new Map<string, Accessor<number>>()
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string, index: Accessor<number>) => {
                        indices.set(item, index)
                        return jsx(Widget, { label: item })
                    },
                }),
            root,
        )

        const onA = vi.fn()
        const onB = vi.fn()
        subscribe(indices.get("a")!, onA)
        subscribe(indices.get("b")!, onB)

        // Appending an item leaves the existing positions untouched.
        setItems(["a", "b", "c"])
        await flush()

        expect(onA).not.toHaveBeenCalled()
        expect(onB).not.toHaveBeenCalled()

        // Moving the front item to the back shifts every position.
        setItems(["b", "c", "a"])
        await flush()

        expect(onA).toHaveBeenCalledTimes(1)
        expect(onB).toHaveBeenCalledTimes(1)
        expect(indices.get("a")?.()).toBe(2)
        expect(indices.get("b")?.()).toBe(0)

        dispose()
    })

    it("memoizes children when items are added", async () => {
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) => jsx(Widget, { label: item }),
                }),
            root,
        )
        const [a, b] = root.children

        setItems(["a", "b", "c"])
        await flush()

        expect(labels(root)).toEqual(["a", "b", "c"])
        expect(root.children[0]).toBe(a)
        expect(root.children[1]).toBe(b)

        dispose()
    })

    it("reorders existing children instead of recreating them", async () => {
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string, index: Accessor<number>) =>
                        jsx(Widget, { label: index.as((i) => `${item}:${i}`) }),
                }),
            root,
        )
        const [a, b] = root.children

        setItems(["b", "a"])
        await flush()

        expect(root.children[0]).toBe(b)
        expect(root.children[1]).toBe(a)
        expect(labels(root)).toEqual(["b:0", "a:1"])

        dispose()
    })

    it("destroys the child and disposes the scope of removed items", async () => {
        const cleanup = vi.fn()
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) => {
                        onCleanup(() => cleanup(item))
                        return jsx(Widget, { label: item })
                    },
                }),
            root,
        )
        const removed = root.children[1]

        setItems(["a"])
        await flush()

        expect(labels(root)).toEqual(["a"])
        expect(removed.destroyed).toBe(true)
        expect(cleanup).toHaveBeenCalledTimes(1)
        expect(cleanup).toHaveBeenCalledWith("b")

        dispose()
    })

    it("keys items with the id function", async () => {
        type Item = { key: string; label: string }

        const a: Item = { key: "a", label: "initial" }
        const [items, setItems] = createState<Item[]>([a])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    id: (item: Item) => item.key,
                    children: (item: Item) => jsx(Widget, { label: item.label }),
                }),
            root,
        )
        const first = root.children[0]

        setItems([a, { key: "b", label: "other" }])
        await flush()

        // The item keyed "a" is unchanged, so its memoized child is reused.
        expect(root.children[0]).toBe(first)
        expect(labels(root)).toEqual(["initial", "other"])

        dispose()
    })

    it("re-renders the child when the item behind an existing key changes", async () => {
        type Item = { key: string; label: string }

        const cleanup = vi.fn()
        const [items, setItems] = createState<Item[]>([{ key: "a", label: "initial" }])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    id: (item: Item) => item.key,
                    children: (item: Item, index: Accessor<number>) => {
                        onCleanup(() => cleanup(item.label))
                        return jsx(Widget, { label: index.as((i) => `${item.label}:${i}`) })
                    },
                }),
            root,
        )
        const first = root.children[0]

        setItems([
            { key: "b", label: "other" },
            { key: "a", label: "changed" },
        ])
        await flush()

        expect(labels(root)).toEqual(["other:0", "changed:1"])
        expect(root.children[1]).not.toBe(first)
        expect(first.destroyed).toBe(true)
        expect(cleanup).toHaveBeenCalledWith("initial")

        dispose()
    })

    it("logs an error for duplicate keys", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const [items, setItems] = createState(["a", "a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) => jsx(Widget, { label: item }),
                }),
            root,
        )

        expect(error).toHaveBeenCalledTimes(1)
        expect(String(error.mock.calls[0][0])).toContain("duplicate keys in <For>: a")

        // no error once the keys are unique again
        setItems(["a", "b"])
        await flush()

        expect(error).toHaveBeenCalledTimes(1)

        error.mockRestore()
        dispose()
    })

    it("accepts a Gio.ListModel as its source", async () => {
        const GioListModel = Gio.ListModel as unknown as new () => object
        class MockListModel extends GioListModel {
            private items: string[]
            private handlers = new Map<number, () => void>()
            private nextId = 1

            constructor(items: string[]) {
                super()
                this.items = items
            }

            get_item(index: number): string | null {
                return this.items[index] ?? null
            }

            connect(_signal: string, callback: () => void): number {
                const id = this.nextId++
                this.handlers.set(id, callback)
                return id
            }

            disconnect(id: number): void {
                this.handlers.delete(id)
            }

            setItems(items: string[]) {
                this.items = items
                for (const callback of [...this.handlers.values()]) callback()
            }
        }

        const model = new MockListModel(["x", "y"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: model,
                    children: (label: string) => jsx(Widget, { label }),
                }),
            root,
        )

        expect(labels(root)).toEqual(["x", "y"])

        model.setItems(["x", "y", "z"])
        await flush()

        expect(labels(root)).toEqual(["x", "y", "z"])

        dispose()
    })

    it("renders flattened fragment children for each item", () => {
        const [items] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) =>
                        jsx(Fragment, {
                            children: [
                                jsx(Widget, { label: `${item}:1` }),
                                jsx(Fragment, { children: jsx(Widget, { label: `${item}:2` }) }),
                            ],
                        }),
                }),
            root,
        )

        expect(labels(root)).toEqual(["a:1", "a:2", "b:1", "b:2"])

        dispose()
    })

    it("moves fragment children together when items reorder", async () => {
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) =>
                        jsx(Fragment, {
                            children: [
                                jsx(Widget, { label: `${item}:1` }),
                                jsx(Widget, { label: `${item}:2` }),
                            ],
                        }),
                }),
            root,
        )
        const [a1, a2, b1, b2] = root.children

        setItems(["b", "a"])
        await flush()

        expect(labels(root)).toEqual(["b:1", "b:2", "a:1", "a:2"])
        expect(root.children).toEqual([b1, b2, a1, a2])

        dispose()
    })

    it("destroys every fragment child of removed items", async () => {
        const [items, setItems] = createState(["a", "b"])

        const root = new Box()
        const dispose = renderTree(
            () =>
                jsx(For, {
                    each: items,
                    children: (item: string) =>
                        jsx(Fragment, {
                            children: [
                                jsx(Widget, { label: `${item}:1` }),
                                jsx(Widget, { label: `${item}:2` }),
                            ],
                        }),
                }),
            root,
        )
        const removed = root.children.slice(2)

        setItems(["a"])
        await flush()

        expect(labels(root)).toEqual(["a:1", "a:2"])
        expect(removed).toHaveLength(2)
        expect(removed.every((widget) => widget.destroyed)).toBe(true)

        dispose()
    })
})

describe("<Portal />", () => {
    it("renders children into the mount point instead of the parent tree", () => {
        const root = new Box()
        const target = new Box()
        const dispose = renderTree(
            () =>
                jsx(Box, {
                    children: [
                        jsx(Widget, { label: "sibling" }),
                        jsx(Portal, {
                            mount: target,
                            children: jsx(Widget, { label: "portaled" }),
                        }),
                    ],
                }),
            root,
        )

        expect(labels(root.children[0])).toEqual(["sibling"])
        expect(labels(target)).toEqual(["portaled"])

        dispose()
    })

    it("cleans up portaled children when disposed", () => {
        const root = new Box()
        const target = new Box()
        const dispose = renderTree(
            () => jsx(Portal, { mount: target, children: jsx(Widget, { label: "portaled" }) }),
            root,
        )
        const portaled = target.children[0]

        dispose()

        expect(target.children).toHaveLength(0)
        expect(portaled.destroyed).toBe(true)
    })

    it("keeps portaled children reactive", async () => {
        const [value, setValue] = createState("a")

        const root = new Box()
        const target = new Box()
        const dispose = renderTree(
            () =>
                jsx(Portal, {
                    mount: target,
                    children: jsx(With, {
                        value,
                        children: (v: string) => jsx(Widget, { label: v }),
                    }),
                }),
            root,
        )

        expect(labels(target)).toEqual(["a"])

        setValue("b")
        await flush()

        expect(labels(target)).toEqual(["b"])

        dispose()
    })

    it("constructs children without attaching them when there is no mount point", () => {
        const ref = vi.fn()

        const root = new Box()
        const dispose = renderTree(() => jsx(Portal, { children: jsx(Widget, { ref }) }), root)

        expect(ref).toHaveBeenCalledTimes(1)
        expect(root.children).toHaveLength(0)

        dispose()
    })
})

describe("component scopes", () => {
    it("mounts components after their objects are attached, parents first", () => {
        const root = new Box()
        const calls: string[] = []

        function Child() {
            onMount(() => calls.push(`child:${root.children.length}`))
            return jsx(Widget, { label: "child" })
        }

        function App() {
            onMount(() => calls.push(`app:${root.children.length}`))
            return jsx(Child, {})
        }

        renderTree(() => jsx(App, {}), root)

        expect(calls).toEqual(["app:1", "child:1"])
    })

    it("runs deferred onMount callbacks with the component scope active", () => {
        let bodyScope: unknown
        let mountScope: unknown

        function Child() {
            bodyScope = getScope()
            onMount(() => (mountScope = getScope()))
            return jsx(Widget, {})
        }

        renderTree(() => jsx(Child, {}), new Box())

        expect(mountScope).toBe(bodyScope)
    })

    it("mounts context provider children after their objects are attached", () => {
        const root = new Box()
        const Ctx = createContext("default")
        const calls: string[] = []

        function Consumer() {
            onMount(() => calls.push(`${Ctx.use()}:${root.children.length}`))
            return jsx(Widget, {})
        }

        renderTree(() => jsx(Ctx, { value: "provided", children: jsx(Consumer, {}) }), root)

        expect(calls).toEqual(["provided:1"])
    })

    it("mounts provide() callbacks with the enclosing scope", () => {
        const root = new Box()
        const Ctx = createContext("default")
        const calls: string[] = []

        function App() {
            return Ctx.provide("provided", () => {
                onMount(() => calls.push(`${Ctx.use()}:${root.children.length}`))
                return jsx(Widget, {})
            })
        }

        renderTree(() => jsx(App, {}), root)

        expect(calls).toEqual(["provided:1"])
    })

    it("runs onMount right away in components rendered after mount", () => {
        const [show, setShow] = createState(false)
        const calls: string[] = []

        function Late() {
            onMount(() => calls.push("late"))
            return jsx(Widget, {})
        }

        renderTree(
            () => jsx("box", { children: show.as((v) => (v ? jsx(Late, {}) : null)) }),
            new Box(),
        )
        expect(calls).toEqual([])

        setShow(true)
        expect(calls).toEqual(["late"])
    })
})

describe("component errors", () => {
    function catchError(fn: () => void): Error & { scopeStack?: string } {
        try {
            fn()
        } catch (error) {
            return error as Error
        }
        throw Error("expected an error to be thrown")
    }

    it("annotates errors with the component stack, innermost first", () => {
        const original = Error("boom")

        function Broken(): GnimNode {
            throw original
        }

        function App() {
            return jsx("box", { children: jsx(Broken, {}) })
        }

        const error = catchError(() => renderTree(() => jsx(App, {}), new Box()))

        expect(error).toBe(original)
        expect(error.scopeStack).toBe("    in <Broken>\n    in <Box>\n    in <App>")
        expect(error.message).toBe(`boom\n${error.scopeStack}`)
    })

    it("annotates only once when the error passes through outer components", () => {
        function Broken(): GnimNode {
            throw Error("boom")
        }

        const Outer = () => jsx(Broken, {})

        const error = catchError(() => renderTree(() => jsx(Outer, {}), new Box()))

        expect(error.message.match(/in <Broken>/g)).toHaveLength(1)
    })

    it("leaves non Error throwables untouched", () => {
        function Broken(): GnimNode {
            throw "boom"
        }

        expect(() => renderTree(() => jsx(Broken, {}), new Box())).toThrow("boom")
    })

    it("does not leak stack entries after an error", () => {
        function Broken(): GnimNode {
            throw Error("first")
        }

        catchError(() => renderTree(() => jsx(Broken, {}), new Box()))

        function AlsoBroken(): GnimNode {
            throw Error("second")
        }

        const error = catchError(() => renderTree(() => jsx(AlsoBroken, {}), new Box()))
        expect(error.scopeStack).toBe("    in <AlsoBroken>")
    })

    it("annotates errors thrown by effects after mount with their component stack", () => {
        const [count, setCount] = createState(0)

        function Counter() {
            effect(() => {
                if (count() > 0) throw Error("effect failed")
            })
            return jsx("box", {})
        }

        const App = () => jsx(Counter, {})

        renderTree(() => jsx(App, {}), new Box())
        const error = catchError(() => setCount(1))

        expect(error.scopeStack).toBe("    in <Counter>\n    in <App>")
    })

    it("annotates errors thrown by computeds with their component stack", () => {
        const [count, setCount] = createState(0)
        let doubled!: Accessor<number>

        function Counter() {
            doubled = computed(() => {
                if (count() > 0) throw Error("computed failed")
                return count() * 2
            })
            return jsx("box", {})
        }

        renderTree(() => jsx(Counter, {}), new Box())
        setCount(1)
        const error = catchError(() => doubled())

        expect(error.scopeStack).toBe("    in <Counter>")
    })

    it("keeps ancestors when a dynamic child throws on update", () => {
        const [show, setShow] = createState(false)

        function Broken(): GnimNode {
            throw Error("boom")
        }

        function App() {
            return jsx("box", { children: show.as((v) => (v ? jsx(Broken, {}) : null)) })
        }

        renderTree(() => jsx(App, {}), new Box())
        const error = catchError(() => setShow(true))

        expect(error.scopeStack).toBe("    in <Broken>\n    in <Box>\n    in <App>")
    })

    it("annotates errors thrown by JSX signal handlers", () => {
        function Clicker() {
            return jsx(Widget, {
                onClicked: () => {
                    throw Error("handler failed")
                },
            })
        }

        const root = new Box()
        renderTree(() => jsx(Clicker, {}), root)
        const error = catchError(() => emit(root.children[0], "clicked", 0, 0))

        expect(error.scopeStack).toBe("    in <Widget>\n    in <Clicker>")
    })

    it("annotates errors thrown by connectSignal handlers", () => {
        const widget = new Widget()

        function Listener() {
            connectSignal(widget as any, "clicked", () => {
                throw Error("handler failed")
            })
            return jsx("box", {})
        }

        renderTree(() => jsx(Listener, {}), new Box())
        const error = catchError(() => emit(widget, "clicked", 0, 0))

        expect(error.scopeStack).toBe("    in <Listener>")
    })

    it("annotates errors thrown by onMount callbacks", () => {
        function Mounted() {
            onMount(() => {
                throw Error("mount failed")
            })
            return jsx("box", {})
        }

        const App = () => jsx(Mounted, {})

        const error = catchError(() => renderTree(() => jsx(App, {}), new Box()))

        expect(error.scopeStack).toBe("    in <Mounted>\n    in <App>")
    })

    it("annotates errors thrown by onCleanup callbacks", () => {
        function Cleaned() {
            onCleanup(() => {
                throw Error("cleanup failed")
            })
            return jsx("box", {})
        }

        const dispose = renderTree(() => jsx(Cleaned, {}), new Box())
        const error = catchError(() => dispose())

        expect(error.scopeStack).toBe("    in <Cleaned>")
    })

    it("does not annotate effects created outside of components", () => {
        const [count, setCount] = createState(0)

        renderTree(() => {
            effect(() => {
                if (count() > 0) throw Error("effect failed")
            })
            return jsx("box", {})
        }, new Box())

        const error = catchError(() => setCount(1))

        expect(error.message).toBe("effect failed")
        expect(error.scopeStack).toBeUndefined()
    })
})
