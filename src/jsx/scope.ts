export class Scope {
    static current: Scope | null

    parent?: Scope | null

    private contexts = new Map<Context, any>()
    private cleanups = new Set<() => void>()

    constructor(parent: Scope | null) {
        this.parent = parent
    }

    setContext<T>(ctx: Context<T>, value: T) {
        this.contexts.set(ctx, value)
    }

    getContext<T>(ctx: Context<T>): T | undefined {
        return this.contexts?.get(ctx)
    }

    onCleanup(callback: () => void) {
        this.cleanups?.add(callback)
    }

    run<T>(fn: () => T) {
        const prev = Scope.current
        Scope.current = this
        try {
            return fn()
        } finally {
            Scope.current = prev
        }
    }

    dispose() {
        this.cleanups.forEach((cb) => cb())
        this.contexts.clear()
        this.cleanups.clear()
        this.parent = null
    }
}

export type Context<T = any> = {
    use(): T
    provide<R>(value: T, fn: () => R): R
    (props: { value: T; children: () => JSX.Element }): JSX.Element
}

/**
 * Example Usage:
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
 *         {() => <ConsumerComponent />}
 *       </MyContext>
 *     </Gtk.Box>
 *   )
 * }
 * ```
 */
export function createContext<T>(defaultValue: T): Context<T> {
    let ctx: Context<T>

    function provide<R>(value: T, fn: () => R): R {
        const scope = new Scope(Scope.current)

        Scope.current = scope
        scope.setContext(ctx, value)
        try {
            return fn()
        } finally {
            Scope.current = scope.parent ?? null
        }
    }

    function use(): T {
        let scope = Scope.current
        while (scope) {
            const value = scope.getContext(ctx)
            if (value) return value
            scope = scope.parent ?? null
        }
        return defaultValue
    }

    function context({ value, children }: { value: T; children: () => JSX.Element }) {
        return provide(value, () => {
            return children()
        })
    }

    return (ctx = Object.assign(context, {
        provide,
        use,
    }))
}

/**
 * Gets the scope that owns the currently running code.
 *
 * Example:
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
        throw Error("current scope is null")
    }

    return scope
}

/**
 * Attach a cleanup callback to the current {@link Scope}.
 */
export function onCleanup(cleanup: () => void) {
    if (!Scope.current) {
        console.warn(Error("current scope is null: will not be able to cleanup"))
    }

    Scope.current?.onCleanup(cleanup)
}

/**
 * Creates a root {@link Scope} that when disposed will remove
 * any child signal handler or state subscriber.
 *
 * Example:
 * ```tsx
 * createRoot((dispose) => {
 *   let root: Gtk.Window
 *
 *   const state = new State("value")
 *
 *   const remove = () => {
 *     root.destroy()
 *     dispose()
 *   }
 *
 *   return (
 *     <Gtk.Window $={(self) => (root = self)}>
 *       <Gtk.Box>
 *         <Gtk.Label label={state} />
 *         <Gtk.Button $clicked={remove} />
 *       </Gtk.Box>
 *     </Gtk.Window>
 *   )
 * })
 * ```
 */
export function createRoot<T>(fn: (dispose: () => void) => T) {
    const scope = new Scope(null)
    return scope.run(() => fn(() => scope.dispose()))
}
