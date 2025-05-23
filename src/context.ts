export type Context<T = any> = {
    use(): T
    provide<R>(value: T, fn: () => R): R
    (props: { value: T; children: () => JSX.Element }): JSX.Element
}

/**
 * @experimental
 */
export function createContext<T>(defaultValue: T): Context<T> {
    let ctx: Context<T>

    const stack: (Map<Context, any> | null)[] = []

    function provide<R>(value: T, fn: () => R) {
        try {
            stack.push(new Map<Context, T>().set(ctx, value))
            return fn()
        } finally {
            stack.pop()
        }
    }

    function context({ value, children }: { value: T; children: () => JSX.Element }) {
        return provide(value, children)
    }

    function use() {
        for (let i = stack.length - 1; i >= 0; i--) {
            const scope = stack[i]
            if (scope?.has(ctx)) {
                return scope.get(ctx)
            }
        }
        return defaultValue
    }

    return (ctx = Object.assign(context, {
        provide,
        use,
    }))
}
