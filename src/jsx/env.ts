import type GObject from "gi://GObject"
import { type Binding } from "../state.js"

type GObj = GObject.Object
export type CC<T extends GObj = GObj> = { new (props: any): T }
export type FC<T extends GObj = GObj> = (props: any) => T

type CssSetter = (object: GObj, css: string | Binding<string>) => void
type ChildFn = (parent: GObj, child: GObj | number | string, index?: number) => void

export function configue(conf: JsxEnv) {
    return Object.assign(env, conf)
}

type JsxEnv = {
    addChild: ChildFn
    intrinsicElements: Record<string, CC | FC>
    setCss: CssSetter
    setClass: CssSetter
    initProps: (props: any) => void
    initObject: (object: GObj) => void
    defaultCleanup: (object: GObj) => void
}

function missingImpl() {
    throw Error("missing impl")
}

export const env: JsxEnv = {
    addChild: missingImpl,
    intrinsicElements: {},
    setCss: missingImpl,
    setClass: missingImpl,
    initProps: (props) => props,
    initObject: () => void 0,
    defaultCleanup: missingImpl,
}
