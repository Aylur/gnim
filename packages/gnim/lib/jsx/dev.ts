import {
    Fragment,
    jsx,
    type CC,
    type ConstructorNode,
    type FC,
    type JSX,
    type Props,
} from "./element.js"
import type { Scope } from "./signal.js"

interface JSXSource {
    fileName: string
    lineNumber: number
    columnNumber: number
}

interface DevHooks {
    createState<T>(init: T, get: () => T): T
    createElementScope(node: ConstructorNode, scope: Scope): void
}

export const devHooks: DevHooks = {
    createState: (init) => init,
    createElementScope: () => {},
}

export const sources = new WeakMap<object, string>()

/**
 * Development version of {@link jsx} that keeps the source location of the JSX expression.
 * Do *not* use this function directly. Use JSX and a transpiler instead.
 */
export function jsxDEV(
    type: string | FC<any> | CC<any>,
    props: Props,
    key?: string | number,
    _isStaticChildren?: boolean,
    source?: JSXSource,
): JSX.Element {
    const element = jsx(type, props, key)
    if (source && type !== Fragment) {
        const { fileName, lineNumber, columnNumber } = source
        sources.set(element, `${fileName}:${lineNumber}:${columnNumber}`)
    }
    return element
}

declare global {
    interface ImportMeta {
        GNIM_DEV?: boolean
    }
}
