export type Context<T = any> = {
    use(): T
    provide<R>(value: T, fn: () => R): R
    (props: { value: T; children: () => JSX.Element }): JSX.Element
}

export class Scope extends Map<Context, any> {
    parent?: Scope | null

    static current: Scope | null

    static with<T>(fn: () => T, scope: Scope | null): T {
        const prev = Scope.current
        Scope.current = scope
        try {
            return fn()
        } finally {
            Scope.current = prev
        }
    }
}

/**
 * @experimental
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
        const scope = new Scope()
        scope.parent = Scope.current

        Scope.current = scope
        scope.set(ctx, value)
        try {
            return fn()
        } finally {
            Scope.current = scope.parent ?? null
        }
    }

    function use(): T {
        let scope = Scope.current
        while (scope) {
            if (scope.has(ctx)) return scope.get(ctx)
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
