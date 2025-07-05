export class Scope {
    static current?: Scope | null

    parent?: Scope | null
    contexts = new Map<Context, unknown>()

    private cleanups = new Set<() => void>()
    private mounts = new Set<() => void>()
    private mounted = false

    constructor(parent?: Scope | null) {
        this.parent = parent
    }

    onCleanup(callback: () => void) {
        this.cleanups?.add(callback)
    }

    onMount(callback: () => void) {
        if (this.parent && !this.parent.mounted) {
            this.parent.onMount(callback)
        } else {
            this.mounts.add(callback)
        }
    }

    run<T>(fn: () => T) {
        const prev = Scope.current
        Scope.current = this

        try {
            return fn()
        } finally {
            this.mounts.forEach((cb) => cb())
            this.mounts.clear()
            this.mounted = true
            Scope.current = prev
        }
    }

    dispose() {
        this.cleanups.forEach((cb) => cb())
        this.cleanups.clear()
        this.contexts.clear()
        delete this.parent
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
        const scope = getScope()
        scope.contexts.set(ctx, value)
        return scope.run(fn)
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

    function context({ value, children }: { value: T; children: () => JSX.Element }) {
        return provide(value, children)
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
 * Attach a callback to run when the currently running {@link Scope} returns.
 */
export function onMount(cleanup: () => void) {
    if (!Scope.current) {
        console.error(Error("cannot attach onMount: out of tracking context"))
    }

    Scope.current?.onMount(cleanup)
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
 *   const [state] = createState("value")
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
