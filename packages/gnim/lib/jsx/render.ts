import GObject from "gi://GObject?version=2.0"
import { mountChildren, type CC, type FC, type GnimNode, type Props } from "./element.js"
import { createContext, Scope, untrack } from "./reactive.js"

const RendererContext = createContext<Renderer | null>(null)

export const setChildren = Symbol("gnim.setChildren")
export const appendChild = Symbol("gnim.appendChild")
export const removeChild = Symbol("gnim.removeChild")

/**
 * Gtk independent `Gtk.Buildable` alternative.
 * Each method returns whether the operation succeded. If `false` it will fallback to default behavior.
 */
export interface Buildable {
    [setChildren]?(children: GObject.Object[], prev: GObject.Object[]): boolean
    [appendChild]?(child: GObject.Object): boolean
    [removeChild]?(child: GObject.Object): boolean
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

export function createRenderer(renderer: Renderer) {
    function render(element: () => GnimNode, root?: GObject.Object) {
        const scope = new Scope(Scope.current)
        scope.contexts.set(RendererContext, renderer)
        scope.run(() => mountChildren(untrack(element), root))
        return () => scope.dispose()
    }

    return { render }
}
