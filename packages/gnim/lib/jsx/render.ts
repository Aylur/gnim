import GObject from "gi://GObject?version=2.0"
import { mountChildren, type CC, type FC, type GnimNode } from "./element.js"
import { createContext, Scope, untrack } from "./reactive.js"

const RendererContext = createContext<Renderer | null>(null)

export const setChildren = Symbol("gnim.setChildren")
export const appendChild = Symbol("gnim.appendChild")
export const removeChild = Symbol("gnim.removeChild")

/**
 * Gtk independent `Gtk.Buildable` alternative.
 * Each method returns whether the operation succeeded. If `false` it will fall back to the default behavior.
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
    constructObject(element: CC, props: Record<string, unknown>): GObject.Object
    createText(string: string): GObject.Object
    prepareProps(klass: CC, props: Record<string, unknown>): Record<string, unknown>
    setProperty(object: GObject.Object, key: string, value: unknown): void
    setChildren(parent: GObject.Object, children: GObject.Object[], prev: GObject.Object[]): void
}

export function render(renderer: Renderer, element: () => GnimNode, root?: GObject.Object) {
    const scope = new Scope(Scope.current)
    scope.contexts.set(RendererContext, renderer)
    scope.run(() => mountChildren(untrack(element), root))
    return () => scope.dispose()
}
