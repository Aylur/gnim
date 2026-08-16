import GObject from "gi://GObject?version=2.0"
import { describe, expect, it, vi } from "vitest"
import type { CC, CCProps, GnimNode } from "../jsx/element.js"
import { For, With, jsx, newObject } from "../jsx/element.js"
import { createState, type Accessor } from "../jsx/reactive.js"
import { getRenderer, render, type Renderer } from "../jsx/render.js"

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

function createRenderer() {
    const appendChild = vi.fn((parent: Widget, child: Widget) => {
        parent.children.push(child)
    })
    const removeChild = vi.fn((parent: Widget, child: Widget) => {
        parent.children = parent.children.filter((ch) => ch !== child)
    })

    return {
        resolveTag: vi.fn((tag: string) => {
            if (tag === "box") return Box
            throw Error(`unresolved JSX tag: "${tag}"`)
        }),
        constructObject: vi.fn((klass: CC, props: Record<string, unknown>) =>
            newObject(klass, props as CCProps<GObject.Object>),
        ),
        createText: vi.fn((text: string) => new Widget({ label: text })),
        prepareProps: vi.fn((_klass: CC, props: Record<string, unknown>) => props),
        setProperty: vi.fn((object: GObject.Object, key: string, value: unknown) => {
            Object.assign(object, { [key]: value })
        }),
        setChildren: vi.fn((parent: Widget, children: Widget[], prev: Widget[]) => {
            for (const child of prev) removeChild(parent, child)
            for (const child of children) appendChild(parent, child)
        }),
        disposeObject: vi.fn((object: Widget) => {
            object.destroyed = true
        }),
    } satisfies Renderer
}

function setup() {
    const renderer = createRenderer()
    const root = new Box()
    const mount = (element: () => GnimNode) => render(renderer, element, root)
    return { renderer, root, mount }
}

const childrenCalls = (renderer: ReturnType<typeof createRenderer>, parent: Widget) =>
    renderer.setChildren.mock.calls.filter(([p]) => p === parent)

describe("render", () => {
    it("returns a dispose function that is safe to call twice", () => {
        const { renderer, mount } = setup()
        const dispose = mount(() => jsx(Widget, {}))

        dispose()

        expect(renderer.setChildren).toHaveBeenCalledTimes(2)
        expect(() => dispose()).not.toThrow()
        expect(renderer.setChildren).toHaveBeenCalledTimes(2)
    })

    it("constructs without mounting when no root is given", () => {
        const renderer = createRenderer()
        const dispose = render(renderer, () => jsx(Widget, { label: "detached" }))

        expect(renderer.constructObject).toHaveBeenCalledTimes(1)
        expect(renderer.setChildren).not.toHaveBeenCalled()

        dispose()

        expect(renderer.setChildren).not.toHaveBeenCalled()
        expect(renderer.disposeObject).toHaveBeenCalledTimes(1)
        expect(renderer.disposeObject.mock.calls[0][0].label).toBe("detached")
    })

    it("scopes each render call to its own renderer", () => {
        const first = setup()
        const second = setup()

        const disposeFirst = first.mount(() => jsx(Widget, { label: "first" }))
        const disposeSecond = second.mount(() => jsx(Widget, { label: "second" }))

        expect(childrenCalls(first.renderer, first.root)).toHaveLength(1)
        expect(childrenCalls(second.renderer, second.root)).toHaveLength(1)
        expect(first.root.children[0].label).toBe("first")
        expect(second.root.children[0].label).toBe("second")

        disposeFirst()
        disposeSecond()
    })
})

describe("getRenderer", () => {
    it("throws outside of a render context", () => {
        expect(() => getRenderer()).toThrow()
    })

    it("returns the active renderer inside components", () => {
        const { renderer, mount } = setup()

        let seen: Renderer | null = null
        function Probe(): GnimNode {
            seen = getRenderer()
            return null
        }

        const dispose = mount(() => jsx(Probe, {}))

        expect(seen).toBe(renderer)

        dispose()
    })
})

describe("resolveTag", () => {
    it("resolves string tags to the constructor used for the element", () => {
        const { renderer, root, mount } = setup()
        const dispose = mount(() => jsx("box", { label: "tagged" }))

        expect(renderer.resolveTag).toHaveBeenCalledTimes(1)
        expect(renderer.resolveTag).toHaveBeenCalledWith("box")
        expect(root.children[0]).toBeInstanceOf(Box)

        dispose()
    })

    it("is not called for class or function components", () => {
        const { renderer, mount } = setup()

        function Component(): GnimNode {
            return jsx(Widget, {})
        }

        const dispose = mount(() => jsx(Component, {}))

        expect(renderer.resolveTag).not.toHaveBeenCalled()

        dispose()
    })
})

describe("prepareProps", () => {
    it("receives the constructor and props without children, ref, or construct", () => {
        const { renderer, mount } = setup()
        const ref = vi.fn()

        const dispose = mount(() =>
            jsx(Widget, { label: "hi", ref, children: jsx(Widget, { label: "child" }) }),
        )

        const [klass, props] = renderer.prepareProps.mock.calls[0]
        expect(klass).toBe(Widget)
        expect(props).toEqual({ label: "hi" })

        // called once for the parent and once for the child
        expect(renderer.prepareProps).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("determines the props used for construction through its return value", () => {
        const { renderer, root, mount } = setup()
        renderer.prepareProps.mockImplementation((_klass, props) => ({
            ...props,
            label: "prepared",
        }))

        const dispose = mount(() => jsx(Widget, { label: "original" }))

        expect(root.children[0].label).toBe("prepared")

        dispose()
    })
})

describe("constructObject", () => {
    it("is called with the class and raw props of class components", () => {
        const { renderer, mount } = setup()
        const dispose = mount(() => jsx(Widget, { label: "x" }))

        expect(renderer.constructObject).toHaveBeenCalledTimes(1)
        expect(renderer.constructObject).toHaveBeenCalledWith(Widget, { label: "x" })

        dispose()
    })

    it("mounts whatever object it returns", () => {
        const { renderer, root, mount } = setup()
        const sentinel = new Widget({ label: "sentinel" })
        renderer.constructObject.mockReturnValue(sentinel)

        const dispose = mount(() => jsx(Widget, { label: "ignored" }))

        expect(root.children).toEqual([sentinel])

        dispose()
    })
})

describe("createText", () => {
    it("creates a text node for strings and stringified numbers", () => {
        const { renderer, root, mount } = setup()
        const dispose = mount(() => ["hello", 42])

        expect(renderer.createText).toHaveBeenNthCalledWith(1, "hello")
        expect(renderer.createText).toHaveBeenNthCalledWith(2, "42")
        expect(root.children.map((child) => child.label)).toEqual(["hello", "42"])

        dispose()
    })
})

describe("setProperty", () => {
    it("is not called for static props, which are passed to the constructor", () => {
        const { renderer, mount } = setup()
        const dispose = mount(() => jsx(Widget, { label: "static" }))

        expect(renderer.setProperty).not.toHaveBeenCalled()

        dispose()
    })

    it("is called for every prop when using the construct prop", () => {
        const { renderer, mount } = setup()
        const widget = new Widget()

        const dispose = mount(() => jsx(Widget, { construct: widget, label: "set" }))

        expect(renderer.setProperty).toHaveBeenCalledTimes(1)
        expect(renderer.setProperty).toHaveBeenCalledWith(widget, "label", "set")

        dispose()
    })

    it("is called with the current value of accessor props", () => {
        const { renderer, root, mount } = setup()
        const [label, setLabel] = createState("initial")

        const dispose = mount(() => jsx(Widget, { label }))
        const widget = root.children[0]

        expect(renderer.setProperty).toHaveBeenCalledTimes(1)
        expect(renderer.setProperty).toHaveBeenCalledWith(widget, "label", "initial")

        setLabel("updated")
        expect(renderer.setProperty).toHaveBeenCalledTimes(2)
        expect(renderer.setProperty).toHaveBeenLastCalledWith(widget, "label", "updated")

        dispose()
        setLabel("ignored")
        expect(renderer.setProperty).toHaveBeenCalledTimes(2)
    })
})

describe("setChildren", () => {
    it("receives the parent and the resolved children in order, children before parents", () => {
        const { renderer, root, mount } = setup()

        const dispose = mount(() =>
            jsx(Box, {
                children: [jsx(Widget, { label: "a" }), jsx(Widget, { label: "b" })],
            }),
        )

        const box = root.children[0]
        expect(renderer.setChildren.mock.calls).toEqual([
            [box, [box.children[0], box.children[1]], []],
            [root, [box], []],
        ])

        dispose()
    })

    it("is not called for childless objects", () => {
        const { renderer, root, mount } = setup()
        const dispose = mount(() => jsx(Widget, {}))
        const widget = root.children[0]

        expect(renderer.setChildren.mock.calls).toEqual([[root, [widget], []]])

        dispose()

        expect(childrenCalls(renderer, widget)).toEqual([])
    })

    it("receives an empty child list when the tree is disposed", () => {
        const { renderer, root, mount } = setup()
        const dispose = mount(() => jsx(Widget, {}))
        const widget = root.children[0]

        renderer.setChildren.mockClear()
        dispose()

        expect(childrenCalls(renderer, root)).toEqual([[root, [], [widget]]])
        expect(root.children).toHaveLength(0)
        expect(widget.destroyed).toBe(true)
    })

    it("receives the new and previous children when a reactive child is replaced", async () => {
        const { renderer, root, mount } = setup()
        const [value, setValue] = createState("a")

        const dispose = mount(() =>
            jsx(With, { value, children: (v: string) => jsx(Widget, { label: v }) }),
        )
        const replaced = root.children[0]

        setValue("b")
        await flush()

        expect(renderer.setChildren).toHaveBeenLastCalledWith(root, [root.children[0]], [replaced])
        expect(replaced.destroyed).toBe(true)

        dispose()
    })

    it("receives moved children in both the new and previous lists on reorder", async () => {
        const { renderer, root, mount } = setup()
        const [items, setItems] = createState(["a", "b"])

        const dispose = mount(() =>
            jsx(For, {
                each: items,
                children: (item: string, index: Accessor<number>) =>
                    jsx(Widget, { label: index.as((i) => `${item}:${i}`) }),
            }),
        )
        const [a, b] = root.children

        setItems(["b", "a"])
        await flush()

        expect(renderer.setChildren).toHaveBeenLastCalledWith(root, [b, a], [a, b])
        expect(root.children).toEqual([b, a])
        // present in both lists, so the renderer can tell they were not removed
        expect(a.destroyed).toBe(false)
        expect(b.destroyed).toBe(false)

        dispose()
    })
})
