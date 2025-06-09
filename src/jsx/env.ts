import type GObject from "gi://GObject"
import { type Accessor } from "./state.js"

type GObj = GObject.Object
export type CC<T extends GObj = GObj> = { new (props: any): T }
export type FC<T extends GObj = GObj> = (props: any) => T

type CssSetter = (object: GObj, css: string | Accessor<string>) => void
type ChildFn = (parent: GObj, child: GObj | number | string, index?: number) => void

export function configue(conf: Partial<JsxEnv>) {
    return Object.assign(env, conf)
}

type JsxEnv = {
    intrinsicElements: Record<string, CC | FC>
    addChild: ChildFn
    setCss: CssSetter
    setClass: CssSetter
    initProps: (props: any) => void
    defaultCleanup: (object: GObj) => void
}

function missingImpl() {
    throw Error("missing impl")
}

export const env: JsxEnv = {
    intrinsicElements: {},
    addChild: missingImpl,
    setCss: missingImpl,
    setClass: missingImpl,
    initProps: () => void 0,
    defaultCleanup: () => void 0,
}
