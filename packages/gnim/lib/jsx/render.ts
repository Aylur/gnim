import GObject from "gi://GObject?version=2.0"
import { setProperty } from "../util.js"
import { mountChildren, newObject, type CC, type FC, type GnimNode, type Props } from "./element.js"
import { createContext, Scope, untrack } from "./reactive.js"

const RendererContext = createContext<Renderer | null>(null)

export const setChildren = Symbol("gnim.setChildren")
export const appendChild = Symbol("gnim.appendChild")
export const removeChild = Symbol("gnim.removeChild")

/**
 * Gtk independent `Gtk.Buildable` alternative
 */
export interface Buildable {
    [setChildren](children: GObject.Object[], prev: GObject.Object[]): void
    [appendChild](child: GObject.Object): void
    [removeChild](child: GObject.Object): void
}

export function getRenderer(): Renderer {
    const renderer = RendererContext.use()
    if (!renderer) throw Error("cannot get renderer: out of tracking context")
    return renderer
}

export interface Renderer {
    resolveTag(tag: string): CC | FC
    constructObject(element: CC, props: Props): GObject.Object
    createText(string: string): GObject.Object
    prepareProps(klass: CC, props: Props): Props
    setProperty(object: GObject.Object, key: string, value: unknown): void
    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void
    appendChild(parent: GObject.Object, child: GObject.Object): void
    removeChild(parent: GObject.Object, child: GObject.Object): void
    destroyChild(parent: GObject.Object, child: GObject.Object): void
}

function resolveTag(tag: string): CC | FC {
    throw Error(`unresolved JSX tag: "${tag}"`)
}

function destroyChild() {
    // noop
}

function prepareProps(_: CC, props: Props) {
    return props
}

function constructObject(element: CC, props: Props): GObject.Object {
    return newObject(
        element as GObject.ObjectClass,
        props as GObject.ConstructorProps<GObject.Object>,
    )
}

function createText(string: string): GObject.Object {
    throw GObject.NotImplementedError(`createText: "${string}"`)
}

export function createRenderer(props: Partial<Renderer>) {
    const renderer: Renderer = {
        resolveTag: props.resolveTag ?? resolveTag,
        constructObject: props.constructObject ?? constructObject,
        createText: props.createText ?? createText,
        setProperty: props.setProperty ?? setProperty,
        prepareProps: props.prepareProps ?? prepareProps,
        destroyChild: props.destroyChild ?? destroyChild,
        setChildren(parent, children, prev) {
            if (setChildren in parent && typeof parent[setChildren] === "function") {
                parent[setChildren](children, prev)
            } else {
                props.setChildren?.(parent, children, prev)
            }
            for (const child of prev.filter((child) => !children.includes(child))) {
                renderer.destroyChild(parent, child)
            }
        },
        appendChild(parent, child) {
            if (appendChild in parent && typeof parent[appendChild] === "function") {
                parent[appendChild](child)
            } else {
                props.appendChild?.(parent, child)
            }
        },
        removeChild(parent, child) {
            if (removeChild in parent && typeof parent[removeChild] === "function") {
                parent[removeChild](child)
            } else {
                props.removeChild?.(parent, child)
            }
        },
    }

    function render(element: () => GnimNode, root?: GObject.Object) {
        const scope = new Scope(Scope.current)
        scope.contexts.set(RendererContext, renderer)
        scope.run(() => mountChildren(untrack(element), root))
        return () => scope.dispose()
    }

    return { render }
}
