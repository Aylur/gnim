import type GObject from "gi://GObject?version=2.0"
import { resolveNode, type GnimNode } from "./element.js"
import type { Accessor } from "./state.js"

/**
 * Scopes contain context values and cleanup functions.
 */
export class Scope {
    static current?: Scope | null

    /** @internal */
    readonly parent?: Scope | null

    /** @internal */
    readonly contexts = new Map<Context, unknown>()

    private cleanups = new Array<() => void>()
    private mounts = new Array<() => void>()
    private mounted = false

    constructor(parent?: Scope | null) {
        this.parent = parent
    }

    /** @internal Use {@link onCleanup} */
    onCleanup(callback: () => void) {
        this.cleanups.unshift(callback)
    }

    /** @internal Use {@link onMount} */
    onMount(callback: () => void) {
        if (this.parent && !this.parent.mounted) {
            this.parent.onMount(callback)
        } else {
            this.mounts.push(callback)
        }
    }

    run<T>(fn: () => T): T {
        const prev = Scope.current
        Scope.current = this

        try {
            return fn()
        } finally {
            this.mounts.forEach((cb) => cb())
            this.mounts.length = 0
            this.mounted = true
            Scope.current = prev
        }
    }

    dispose() {
        this.cleanups.forEach((cb) => cb())
        this.cleanups.length = 0
        // @ts-expect-error readonly
        this.parent = null
    }
}

/**
 * Context lets components pass information deep down without explicitly
 * passing props.
 *
 * @see {createContext}
 */
export interface Context<T = any> {
    use(): T
    provide<R>(value: T, fn: () => R): R
    (props: { value: T; children: GnimNode }): GnimNode
}

/**
 * Lets you create a {@link Context} that components can provide or read.
 *
 * @param defaultValue The value you want the context to have when there is no
 * provider in the tree above the component reading the context. This is meant
 * as a "last resort" fallback.
 *
 * @example
 *
 * ```tsx
 * const MyContext = createContext("fallback-value")
 *
 * function ConsumerComponent() {
 *   const value = MyContext.use()
 *
 *   return <Gtk.Label label={value} />
 * }
 *
 * function ProviderComponent() {
 *   return (
 *     <Gtk.Box>
 *       <MyContext value="my-value">
 *         <ConsumerComponent />
 *       </MyContext>
 *     </Gtk.Box>
 *   )
 * }
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
    let ctx: Context<T>

    function context(value: T) {
        const parent = getScope()
        const scope = new Scope(parent)
        scope.contexts.set(ctx, value)
        return scope
    }

    function use(): T {
        let scope = Scope.current
        while (scope) {
            const value = scope.contexts.get(ctx)
            if (value !== undefined) return value as T
            scope = scope.parent
        }
        return defaultValue
    }

    function provide<R>(value: T, fn: () => R): R {
        return context(value).run(fn)
    }

    function Context(props: {
        value: T
        children: GnimNode
    }): Array<GObject.Object | Accessor<GnimNode>> {
        const { value, children } = props
        return context(value).run(() => resolveNode(children))
    }

    return (ctx = Object.assign(Context, { use, provide }))
}

/**
 * Gets the scope that owns the currently running code.
 *
 * @example
 *
 * ```ts
 * const scope = getScope()
 * setTimeout(() => {
 *   // This callback gets run without an owner scope.
 *   // Restore owner via scope.run:
 *   scope.run(() => {
 *     const foo = FooContext.use()
 *     onCleanup(() => {
 *       print("some cleanup")
 *     })
 *   })
 * }, 1000)
 * ```
 */
export function getScope(): Scope {
    const scope = Scope.current
    if (!scope) {
        throw Error("cannot get scope: out of tracking context")
    }

    return scope
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 */
export function onCleanup(cleanup: () => void) {
    if (!Scope.current) {
        console.error(Error("out of tracking context: will not be able to cleanup"))
    }

    Scope.current?.onCleanup(cleanup)
}

/**
 * Creates a root {@link Scope} that when disposed will remove
 * any child signal handler or state observer.
 *
 * @example
 *
 * ```tsx
 * const [n] = state(0)
 * createRoot((dispose) => {
 *   effect(() => {
 *     console.log(`value: ${n()}`)
 *
 *     if (n() === 5) {
 *       dispose()
 *     }
 *   })
 * })
 * ```
 */
export function createRoot<T>(fn: (dispose: () => void) => T, parent?: Scope) {
    const scope = new Scope(parent)
    return scope.run(() => fn(() => scope.dispose()))
}
