export { Fragment, type CC, type FC, type GnimNode, type JSX } from "./jsx/element.js"
export { For, Portal, With } from "./jsx/flow.js"
export { connectEffect, ref } from "./jsx/gstate.js"
export { appendChild, removeChild, setChildren, type Buildable } from "./jsx/render.js"
export {
    createContext,
    createRoot,
    getScope,
    onCleanup,
    type Context,
    type Scope,
} from "./jsx/scope.js"
export {
    computed,
    effect,
    state,
    type Accessed,
    type Accessor,
    type Setter,
    type State,
} from "./jsx/state.js"

import { For, Portal, With } from "./jsx/flow.js"
import { connectEffect, ref } from "./jsx/gstate.js"
import { appendChild, removeChild, setChildren } from "./jsx/render.js"
import { createContext, createRoot, getScope, onCleanup } from "./jsx/scope.js"
import { computed, effect, state } from "./jsx/state.js"

const Gnim = {
    For,
    Portal,
    With,
    connectEffect,
    ref,
    appendChild,
    removeChild,
    setChildren,
    createContext,
    createRoot,
    getScope,
    onCleanup,
    computed,
    effect,
    state,
}

export default Gnim
