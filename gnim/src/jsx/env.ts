import type GObject from "gi://GObject"
import { type Accessor } from "./state.js"

type GObj = GObject.Object
export type CC<T extends GObj = GObj> = { new (props: any): T }
export type FC<T extends GObj = GObj> = (props: any) => T

type CssSetter = (object: GObj, css: string | Accessor<string>) => void

export function configue(conf: Partial<JsxEnv>) {
    return Object.assign(env, conf)
}

type JsxEnv = {
    intrinsicElements: Record<string, CC | FC>
    textNode(node: string | number): GObj
    appendChild(parent: GObj, child: GObj): void
    removeChild(parent: GObj, child: GObj): void
    setCss: CssSetter
    setClass: CssSetter
    // string[] can be use to delay setting props after children
    // e.g Gtk.Stack["visibleChildName"] depends on children
    initProps(ctor: unknown, props: any): void | string[]
    defaultCleanup(object: GObj): void
}

function missingImpl(): any {
    throw Error("missing impl")
}

export const env: JsxEnv = {
    intrinsicElements: {},
    textNode: missingImpl,
    appendChild: missingImpl,
    removeChild: missingImpl,
    setCss: missingImpl,
    setClass: missingImpl,
    initProps: () => void 0,
    defaultCleanup: () => void 0,
}
