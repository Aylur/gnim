import GObject from "gi://GObject?version=2.0"
import { describe, expect, it } from "vitest"
import type { CCProps, FC, GnimNode } from "../jsx/element.js"
import { For, With, jsx, newObject } from "../jsx/element.js"
import { createComponentRegistry } from "../jsx/hmr.js"
import { createState, type Accessor, type Setter } from "../jsx/reactive.js"
import { render, type Renderer } from "../jsx/render.js"

class Widget extends GObject.Object {
    label = ""
    children: Widget[] = []

    constructor(props: Record<string, unknown> = {}) {
        super()
        Object.assign(this, props)
    }
}

const renderer: Renderer = {
    resolveTag() {
        return Widget
    },
    constructObject(klass, props) {
        return newObject(klass, props as CCProps<GObject.Object>)
    },
    createText(text) {
        return new Widget({ label: text })
    },
    prepareProps(_, props) {
        return props
    },
    setProperty(object, key, value) {
        Object.assign(object, { [key]: value })
    },
    setChildren(parent: Widget, children: Widget[], prev: Widget[]) {
        parent.children = parent.children.filter((child) => !prev.includes(child))
        parent.children.push(...children)
    },
    disposeObject() {},
}

const register = createComponentRegistry()

const renderTree = (element: () => GnimNode) => {
    const root = new Widget()
    const dispose = render(renderer, element, root)
    return { root, dispose }
}

const labels = (widget: Widget) => widget.children.map((child) => child.label)

function counter(init = 0) {
    const setters = new Array<Setter<number>>()
    const impl: FC = () => {
        const [count, setCount] = createState(init)
        setters.push(setCount)
        return jsx(Widget, { label: count.as(String) })
    }
    return { impl, setters }
}

describe("hot reload", () => {
    it("re-renders instances with the new implementation", () => {
        const Comp = register("reload:Comp", () => jsx(Widget, { label: "old" }))
        const { root, dispose } = renderTree(() => jsx(Comp, {}))

        expect(labels(root)).toEqual(["old"])

        register("reload:Comp", () => jsx(Widget, { label: "new" }))
        expect(labels(root)).toEqual(["new"])

        dispose()
    })

    it("restores state across a reload", () => {
        const { impl, setters } = counter()
        const Counter = register("restore:Counter", impl)
        const { root, dispose } = renderTree(() => jsx(Counter, {}))

        setters[0](5)
        expect(labels(root)).toEqual(["5"])

        register("restore:Counter", counter().impl)
        expect(labels(root)).toEqual(["5"])

        dispose()
    })

    it("restores a state whose current value is nullish", () => {
        let setValue!: Setter<string | null>
        const impl: FC = () => {
            const [value, set] = createState<string | null>("init")
            setValue = set
            return jsx(Widget, { label: value.as((v) => v ?? "null") })
        }
        const Comp = register("nullish:Comp", impl)
        const { root, dispose } = renderTree(() => jsx(Comp, {}))

        setValue(null)
        register("nullish:Comp", (props) => impl(props))
        expect(labels(root)).toEqual(["null"])

        dispose()
    })

    it("resets state when its initial value changes", () => {
        const { impl, setters } = counter(0)
        const Counter = register("reset:Counter", impl)
        const { root, dispose } = renderTree(() => jsx(Counter, {}))

        setters[0](5)
        register("reset:Counter", counter(10).impl)
        expect(labels(root)).toEqual(["10"])

        dispose()
    })

    it("keeps the state of each instance separate across a reload", () => {
        const { impl, setters } = counter()
        const Counter = register("instances:Counter", impl)
        const { root, dispose } = renderTree(() => [
            jsx(Counter, {}),
            jsx(Counter, {}),
            jsx(Counter, {}),
        ])

        setters.forEach((set, i) => set(i + 1))
        expect(labels(root)).toEqual(["1", "2", "3"])

        register("instances:Counter", counter().impl)
        expect(labels(root)).toEqual(["1", "2", "3"])

        dispose()
    })

    it("does not give a later mounted instance the state of another one", () => {
        const { impl, setters } = counter()
        const Counter = register("later:Counter", impl)
        const [show, setShow] = createState(false)
        const { root, dispose } = renderTree(() => [
            jsx(Counter, {}),
            jsx(With, { value: show, children: (show: boolean) => show && jsx(Counter, {}) }),
        ])

        setters[0](5)
        setShow(true)
        expect(labels(root)).toEqual(["5", "0"])

        dispose()
    })

    it("restores the state of each child instance when their parent reloads", () => {
        const { impl, setters } = counter()
        const Counter = register("parent:Counter", impl)
        const parent: FC = () => [jsx(Counter, {}), jsx(Counter, {})]
        const Parent = register("parent:Parent", parent)
        const { root, dispose } = renderTree(() => jsx(Parent, {}))

        setters[0](1)
        setters[1](2)

        register("parent:Parent", () => [...(parent({}) as GnimNode[]), jsx(Counter, {})])
        expect(labels(root)).toEqual(["1", "2", "0"])

        dispose()
    })

    it("does not restore state created after the render from the component's state", () => {
        let setCount!: Setter<number>
        const [show, setShow] = createState(false)
        const Comp = register("late:Comp", () => {
            const [count, set] = createState(0)
            setCount = set
            return jsx(Widget, {
                label: count.as(String),
                children: jsx(With, {
                    value: show,
                    children: (show: boolean) => {
                        const [late] = createState(0)
                        return show && jsx(Widget, { label: late.as((n) => `late ${n}`) })
                    },
                }),
            })
        })
        const { root, dispose } = renderTree(() => jsx(Comp, {}))

        setCount(7)
        setShow(true)
        expect(root.children[0].label).toBe("7")
        expect(labels(root.children[0])).toEqual(["late 0"])

        dispose()
    })

    describe("with <For>", () => {
        // states are matched by the identity of their initial value
        const noItems = new Array<string>()

        function list(init: number) {
            const state = {} as { setCount: Setter<number>; setItems: Setter<string[]> }
            const impl: FC = () => {
                const [count, setCount] = createState(init)
                const [items, setItems] = createState(noItems)
                Object.assign(state, { setCount, setItems })
                return jsx(Widget, {
                    label: count.as(String),
                    children: jsx(For, {
                        each: items,
                        children: (item: string, index: Accessor<number>) =>
                            jsx(Widget, { label: index.as((i) => `${i}:${item}`) }),
                    }),
                })
            }
            return { impl, state }
        }

        it("does not restore an item's index from the component's state", () => {
            const { impl, state } = list(0)
            const List = register("for-index:List", impl)
            const { root, dispose } = renderTree(() => jsx(List, {}))

            state.setCount(7)
            state.setItems(["a"])
            expect(labels(root.children[0])).toEqual(["0:a"])

            dispose()
        })

        it("restores state after items were added", () => {
            const { impl, state } = list(100)
            const List = register("for-items:List", impl)
            const { root, dispose } = renderTree(() => jsx(List, {}))

            state.setCount(105)
            state.setItems(["a", "b"])

            // twice: the first reload used to restore the state but not record it again
            for (let i = 0; i < 2; i++) {
                register("for-items:List", list(100).impl)
                expect(root.children[0].label).toBe("105")
                expect(labels(root.children[0])).toEqual(["0:a", "1:b"])
            }

            dispose()
        })
    })
})
