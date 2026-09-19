import { describe, expect, it, vi } from "vitest"
import {
    computed,
    createAccessor,
    createContext,
    createRoot,
    createState,
    effect,
    getScope,
    isAccessor,
    onCleanup,
    onMount,
    subscribe,
    untrack,
    type Accessor,
} from "../jsx/reactive.js"
import { batch, getScope as getActiveScope, runScope } from "../jsx/signal.js"

describe("createRoot", () => {
    it("returns the value produced by its callback", () => {
        const result = createRoot(() => 42)
        expect(result).toBe(42)
    })

    it("establishes a tracking context", () => {
        createRoot((dispose) => {
            expect(() => getScope()).not.toThrow()
            dispose()
        })
    })

    it("restores the previous scope after it returns", () => {
        expect(getActiveScope()).toBeNull()

        createRoot(() => {
            const outer = getScope()
            createRoot(() => {
                expect(getScope()).not.toBe(outer)
            })
            expect(getScope()).toBe(outer)
        })

        expect(getActiveScope()).toBeNull()
    })

    it("runs cleanups registered inside it when disposed", () => {
        const cleanup = vi.fn()

        createRoot((dispose) => {
            onCleanup(cleanup)
            dispose()
        })

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("stops effects created inside it once disposed", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
        setValue(1)

        expect(spy).toHaveBeenCalledTimes(1)
    })

    it("is disposed together with the enclosing scope", () => {
        const cleanup = vi.fn()

        const dispose = createRoot((dispose) => {
            createRoot(() => onCleanup(cleanup))
            return dispose
        })

        expect(cleanup).not.toHaveBeenCalled()
        dispose()
        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("attaches to an explicitly given parent scope", () => {
        const cleanup = vi.fn()

        const { scope, dispose } = createRoot((dispose) => ({ scope: getScope(), dispose }))

        createRoot(() => onCleanup(cleanup), scope)

        dispose()
        expect(cleanup).toHaveBeenCalledTimes(1)
    })
})

describe("getScope", () => {
    it("throws outside of a scope", () => {
        expect(() => getScope()).toThrow()
    })

    it("returns the scope of the running effect", () => {
        createRoot((dispose) => {
            const root = getScope()
            effect(() => {
                expect(getScope()).not.toBe(root)
                expect(getScope().parent).toBe(root)
            })
            dispose()
        })
    })
})

describe("onCleanup", () => {
    it("runs the callback when the owning scope is disposed", () => {
        const cleanup = vi.fn()

        createRoot((dispose) => {
            onCleanup(cleanup)
            dispose()
        })

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("throws outside of a scope", () => {
        expect(() => onCleanup(() => void 0)).toThrow()
    })

    it("runs cleanups in reverse registration order", () => {
        const order: number[] = []

        createRoot((dispose) => {
            onCleanup(() => order.push(1))
            onCleanup(() => order.push(2))
            onCleanup(() => order.push(3))
            dispose()
        })

        expect(order).toEqual([3, 2, 1])
    })

    it("runs remaining cleanups and completes disposal before rethrowing", () => {
        const first = vi.fn()
        const last = vi.fn()

        const { scope, dispose } = createRoot((dispose) => {
            onCleanup(last)
            onCleanup(() => {
                throw Error("boom")
            })
            onCleanup(first)
            return { scope: getScope(), dispose }
        })

        expect(() => dispose()).toThrow("boom")

        expect(first).toHaveBeenCalledTimes(1)
        expect(last).toHaveBeenCalledTimes(1)
        expect(scope.disposed).toBe(true)
        expect(scope.cleanups).toHaveLength(0)
    })

    it("does not re-run cleanups when disposed twice", () => {
        const cleanup = vi.fn()

        createRoot((dispose) => {
            onCleanup(cleanup)
            dispose()
            dispose()
        })

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("runs cleanups untracked", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                spy()
                onCleanup(() => value())
            })
            return { setValue, dispose }
        })

        setValue(1)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("onMount", () => {
    it("runs after the scope body returns", () => {
        const order: string[] = []

        createRoot(() => {
            onMount(() => order.push("mount"))
            order.push("sync")
        })

        expect(order).toEqual(["sync", "mount"])
    })

    it("runs mount callbacks in registration order", () => {
        const order: number[] = []

        createRoot(() => {
            onMount(() => order.push(1))
            onMount(() => order.push(2))
            onMount(() => order.push(3))
        })

        expect(order).toEqual([1, 2, 3])
    })

    it("runs immediately when the scope is already mounted", () => {
        const spy = vi.fn()

        const scope = createRoot(() => getScope())

        runScope(scope, () => {
            onMount(spy)
            expect(spy).toHaveBeenCalledTimes(1)
        })

        scope.dispose()
    })

    it("runs immediately outside of a scope", () => {
        const spy = vi.fn()
        onMount(spy)
        expect(spy).toHaveBeenCalledTimes(1)
    })

    it("does not run when the scope body throws", () => {
        const spy = vi.fn()

        expect(() =>
            createRoot(() => {
                onMount(spy)
                throw Error("boom")
            }),
        ).toThrow("boom")

        expect(spy).not.toHaveBeenCalled()
    })

    it("runs remaining mount callbacks before rethrowing", () => {
        const spy = vi.fn()

        expect(() =>
            createRoot(() => {
                onMount(() => {
                    throw Error("boom")
                })
                onMount(spy)
            }),
        ).toThrow("boom")

        expect(spy).toHaveBeenCalledTimes(1)
        expect(getActiveScope()).toBeNull()
    })

    it("runs untracked", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                spy()
                onMount(() => value())
            })
            return { setValue, dispose }
        })

        setValue(1)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("createState", () => {
    it("exposes the initial value through its accessor", () => {
        const [value] = createState(1)
        expect(value()).toBe(1)
    })

    it("updates the value when the setter is called", () => {
        const [value, setValue] = createState(1)
        setValue(2)
        expect(value()).toBe(2)
    })

    it("supports functional updates based on the previous value", () => {
        const [count, setCount] = createState(10)
        setCount((prev) => prev + 5)
        expect(count()).toBe(15)
    })

    it("passes the pending value to functional updates inside a batch", () => {
        const [count, setCount] = createState(0)

        batch(() => {
            setCount(1)
            setCount((prev) => prev + 1)
        })

        expect(count()).toBe(2)
    })

    it("notifies subscribers when the value changes", () => {
        const [value, setValue] = createState(0)
        const observer = vi.fn()

        subscribe(value, observer)
        setValue(1)

        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("stops notifying after unsubscribing", () => {
        const [value, setValue] = createState(0)
        const observer = vi.fn()

        const unsubscribe = subscribe(value, observer)
        setValue(1)
        unsubscribe()
        setValue(2)

        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("does not notify when the value is unchanged (Object.is)", () => {
        const [value, setValue] = createState(5)
        const observer = vi.fn()

        subscribe(value, observer)
        setValue(5)

        expect(observer).not.toHaveBeenCalled()
    })

    it("notifies remaining subscribers before rethrowing when one throws", () => {
        const sibling = vi.fn()

        const [value, setValue] = createState(0)
        const unsubscribe = subscribe(value, () => {
            throw Error("boom")
        })
        subscribe(value, sibling)

        expect(() => setValue(1)).toThrow("boom")
        expect(sibling).toHaveBeenCalledTimes(1)

        unsubscribe()
        expect(() => setValue(2)).not.toThrow()
        expect(sibling).toHaveBeenCalledTimes(2)
    })

    it("honors a custom equality function", () => {
        const [value, setValue] = createState({ id: 1 }, { equals: (a, b) => a.id === b.id })
        const observer = vi.fn()

        subscribe(value, observer)
        setValue({ id: 1 })
        expect(observer).not.toHaveBeenCalled()

        setValue({ id: 2 })
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("stores functions through the producer form", () => {
        const fn = () => "value"
        const [value, setValue] = createState<() => string>(() => "init")

        setValue(() => fn)

        expect(value()).toBe(fn)
    })
})

describe("subscribe", () => {
    it("tracks every accessor read in the tracker", () => {
        const [a, setA] = createState(0)
        const [b, setB] = createState(0)
        const observer = vi.fn()

        const unsubscribe = subscribe(() => {
            a()
            b()
        }, observer)

        setA(1)
        setB(1)
        expect(observer).toHaveBeenCalledTimes(2)

        unsubscribe()
    })

    it("does not track reads made in the callback", () => {
        const [a, setA] = createState(0)
        const [b, setB] = createState(0)
        const observer = vi.fn(() => b())

        const unsubscribe = subscribe(a, observer)

        setA(1)
        expect(observer).toHaveBeenCalledTimes(1)

        setB(1)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    it("re-tracks dynamic dependencies on every notification", () => {
        const [cond, setCond] = createState(true)
        const [a, setA] = createState("a")
        const [b, setB] = createState("b")
        const observer = vi.fn()

        const unsubscribe = subscribe(() => (cond() ? a() : b()), observer)

        setB("b2")
        expect(observer).not.toHaveBeenCalled()

        setCond(false)
        expect(observer).toHaveBeenCalledTimes(1)

        setA("a2")
        expect(observer).toHaveBeenCalledTimes(1)

        setB("b3")
        expect(observer).toHaveBeenCalledTimes(2)

        unsubscribe()
    })

    it("only notifies once per batch", () => {
        const [a, setA] = createState(0)
        const [b, setB] = createState(0)
        const observer = vi.fn()

        const unsubscribe = subscribe(() => a() + b(), observer)

        batch(() => {
            setA(1)
            setB(1)
        })

        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    it("is not disposed with the enclosing scope", () => {
        const observer = vi.fn()

        const { setValue, unsubscribe, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            const unsubscribe = subscribe(value, observer)
            return { setValue, unsubscribe, dispose }
        })

        dispose()
        setValue(1)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
        setValue(2)
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("does not notify for a computed whose value is unchanged", () => {
        const [a, setA] = createState(1)
        const isEven = computed(() => a() % 2 === 0)
        const observer = vi.fn()

        const unsubscribe = subscribe(isEven, observer)

        setA(3)
        expect(observer).not.toHaveBeenCalled()

        setA(4)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })
})

describe("effect", () => {
    it("runs once when the owning scope mounts", () => {
        const order: string[] = []

        createRoot(() => {
            effect(() => order.push("effect"))
            order.push("sync")
        })

        expect(order).toEqual(["sync", "effect"])
    })

    it("runs immediately when the immediate option is set", () => {
        const order: string[] = []

        createRoot(() => {
            effect(() => order.push("effect"), { immediate: true })
            order.push("sync")
        })

        expect(order).toEqual(["effect", "sync"])
    })

    it("runs immediately when created in an already mounted scope", () => {
        const spy = vi.fn()

        const { scope, value, setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            return { scope: getScope(), value, setValue, dispose }
        })

        runScope(scope, () => {
            effect(() => spy(value()))
            expect(spy).toHaveBeenNthCalledWith(1, 0)
        })

        setValue(1)
        expect(spy).toHaveBeenNthCalledWith(2, 1)

        dispose()
        setValue(2)
        expect(spy).toHaveBeenCalledTimes(2)
    })

    it("runs immediately and keeps running when created outside a scope", () => {
        const spy = vi.fn()
        const [value, setValue] = createState(0)

        effect(() => spy(value()))
        expect(spy).toHaveBeenCalledTimes(1)

        setValue(1)
        expect(spy).toHaveBeenLastCalledWith(1)
    })

    it("re-runs synchronously when a tracked dependency changes", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenNthCalledWith(1, 0)

        setValue(1)
        expect(spy).toHaveBeenNthCalledWith(2, 1)

        dispose()
    })

    it("receives the previous returned value", () => {
        const seen: Array<number | undefined> = []

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(1)
            effect<number>((prev) => {
                seen.push(prev)
                return value()
            })
            return { setValue, dispose }
        })

        setValue(2)

        expect(seen).toEqual([undefined, 1])

        dispose()
    })

    it("does not re-run for untracked reads", () => {
        const spy = vi.fn()

        const { setTracked, setUntracked, dispose } = createRoot((dispose) => {
            const [tracked, setTracked] = createState(0)
            const [untracked, setUntracked] = createState(0)
            effect(() => {
                tracked()
                untrack(untracked)
                spy()
            })
            return { setTracked, setUntracked, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setUntracked(1)
        expect(spy).toHaveBeenCalledTimes(1)

        setTracked(1)
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("does not re-run when a dependency is set to an equal value", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        setValue(0)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("does not re-run for a write to its own dependency", () => {
        const spy = vi.fn()

        const { value, setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                spy(value())
                if (value() < 3) setValue(value() + 1)
            })
            return { value, setValue, dispose }
        })

        // The write is applied, but the writing effect is not re-triggered by it.
        expect(spy.mock.calls).toEqual([[0]])
        expect(value()).toBe(1)

        // External writes still re-run it, and again without a self-loop.
        setValue(2)
        expect(spy.mock.calls).toEqual([[0], [2]])
        expect(value()).toBe(3)

        dispose()
    })
})

describe("scope bookkeeping", () => {
    it("does not grow the owning scope on effect and computed re-runs", () => {
        const { scope, setValue, dispose } = createRoot((dispose) => {
            const scope = getScope()
            const [value, setValue] = createState(0)
            const double = computed(() => value() * 2)
            effect(() => double())
            return { scope, setValue, dispose }
        })

        const cleanups = scope.cleanups?.length ?? 0
        const children = scope.children?.length ?? 0

        for (let i = 1; i <= 10; i++) {
            setValue(i)
        }

        expect(scope.cleanups?.length ?? 0).toBe(cleanups)
        expect(scope.children?.length ?? 0).toBe(children)

        dispose()

        expect(scope.children?.length ?? 0).toBe(0)
        expect(scope.cleanups?.length ?? 0).toBe(0)
    })

    it("detaches a disposed child scope from its parent", () => {
        const { scope, dispose } = createRoot((dispose) => ({ scope: getScope(), dispose }))

        const child = createRoot(() => getScope(), scope)
        expect(scope.children).toContain(child)

        child.dispose()
        expect(scope.children).not.toContain(child)

        dispose()
    })

    it("runs effect cleanups when the owner disposes after re-runs", () => {
        const cleanup = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                value()
                onCleanup(cleanup)
            })
            return { setValue, dispose }
        })

        setValue(1)
        expect(cleanup).toHaveBeenCalledTimes(1)

        dispose()
        expect(cleanup).toHaveBeenCalledTimes(2)
    })
})

describe("computed", () => {
    it("derives a value from its dependencies", () => {
        createRoot((dispose) => {
            const [a] = createState(2)
            const [b] = createState(3)
            const sum = computed(() => a() + b())

            expect(sum()).toBe(5)
            dispose()
        })
    })

    it("is lazy until first read", () => {
        const body = vi.fn(() => 1)
        const value = computed(body)

        expect(body).not.toHaveBeenCalled()
        expect(value()).toBe(1)
        expect(body).toHaveBeenCalledTimes(1)
    })

    it("receives its previous value", () => {
        const [a, setA] = createState(1)
        const history = computed<number[]>((prev = []) => [...prev, a()])

        expect(history()).toEqual([1])

        setA(2)
        expect(history()).toEqual([1, 2])
    })

    it("recomputes when a dependency changes", () => {
        const { setA, value, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const doubled = computed(() => a() * 2)
            let value = 0
            effect(() => (value = doubled()))
            return { setA, value: () => value, dispose }
        })

        expect(value()).toBe(2)

        setA(5)
        expect(value()).toBe(10)

        dispose()
    })

    it("only notifies observers when the computed value changes", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const isEven = computed(() => a() % 2 === 0)
            effect(() => spy(isEven()))
            return { setA, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setA(3) // 1 -> 3, still odd
        expect(spy).toHaveBeenCalledTimes(1)

        setA(4) // odd -> even
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("honors a custom equality function", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const obj = computed(() => ({ id: a() }), { equals: (x, y) => x.id === y.id })
            effect(() => spy(obj()))
            return { setA, dispose }
        })

        setA(1)
        expect(spy).toHaveBeenCalledTimes(1)

        setA(2)
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("chains derived accessors", () => {
        const { setA, value, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const plusOne = computed(() => a() + 1)
            const timesTen = computed(() => plusOne() * 10)
            let value = 0
            effect(() => (value = timesTen()))
            return { setA, value: () => value, dispose }
        })

        expect(value()).toBe(20)

        setA(4)
        expect(value()).toBe(50)

        dispose()
    })

    it("memoizes across repeated reads", () => {
        const body = vi.fn()

        createRoot((dispose) => {
            const [a, setA] = createState(1)
            const doubled = computed(() => {
                body()
                return a() * 2
            })

            expect(doubled()).toBe(2)
            expect(doubled()).toBe(2)
            expect(doubled()).toBe(2)
            expect(body).toHaveBeenCalledTimes(1)

            setA(2)
            expect(doubled()).toBe(4)
            // Recomputed exactly once for the dependency change.
            expect(body).toHaveBeenCalledTimes(2)

            dispose()
        })
    })

    it("short-circuits a chain when an intermediate value is stable", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const parity = computed(() => a() % 2)
            const label = computed(() => (parity() === 0 ? "even" : "odd"))
            effect(() => spy(label()))
            return { setA, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setA(3) // parity stays 1 -> label stays "odd" -> no downstream re-run
        expect(spy).toHaveBeenCalledTimes(1)

        setA(2) // parity flips to 0 -> label becomes "even"
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith("even")

        dispose()
    })

    it("rethrows the computation error to readers", () => {
        const boom = computed((): number => {
            throw Error("boom")
        })

        expect(() => boom()).toThrow("boom")
        expect(() => boom.peek()).toThrow("boom")
        expect(() => subscribe(boom, () => void 0)).toThrow("boom")
    })

    it("recovers once the dependency makes the computation succeed", () => {
        const [a, setA] = createState(-1)
        const abs = computed(() => {
            const v = a()
            if (v < 0) throw Error("negative")
            return v * 2
        })

        expect(() => abs()).toThrow("negative")

        setA(1)
        expect(abs()).toBe(2)

        setA(-2)
        expect(() => abs()).toThrow("negative")

        setA(3)
        expect(abs()).toBe(6)
    })

    it("rethrows in effects and keeps the effect subscribed", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const checked = computed(() => {
                if (a() === 1) throw Error("boom")
                return a()
            })
            effect(() => spy(checked()))
            return { setA, dispose }
        })

        expect(() => setA(1)).toThrow("boom")
        expect(getActiveScope()).toBeNull()

        setA(2)
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })

    it("recomputes when read again after losing all subscribers", () => {
        const body = vi.fn()
        const [a, setA] = createState(1)
        const doubled = computed(() => {
            body()
            return a() * 2
        })

        const dispose = createRoot((dispose) => {
            effect(() => doubled())
            return dispose
        })
        expect(body).toHaveBeenCalledTimes(1)

        dispose()
        setA(2)
        expect(body).toHaveBeenCalledTimes(1)

        expect(doubled()).toBe(4)
        expect(body).toHaveBeenCalledTimes(2)
    })

    it("disposes scopes created in the computation before re-running", () => {
        const [a, setA] = createState(0)
        const log: string[] = []

        const c = computed(() => {
            log.push("computed:eval")
            effect(() => {
                log.push("inner:run")
                onCleanup(() => log.push("inner:cleanup"))
            })
            return a()
        })

        const dispose = createRoot((dispose) => {
            effect(() => c())
            return dispose
        })
        log.length = 0

        setA(1)
        expect(log).toEqual(["inner:cleanup", "computed:eval", "inner:run"])

        dispose()
    })

    it("disposes child effects in reverse order when it becomes unwatched", () => {
        const log: string[] = []
        const c = computed(() => {
            effect(() => onCleanup(() => log.push("e1")))
            effect(() => onCleanup(() => log.push("e2")))
            effect(() => onCleanup(() => log.push("e3")))
            return 0
        })

        const dispose = createRoot((dispose) => {
            effect(() => c())
            return dispose
        })
        log.length = 0

        dispose()
        expect(log).toEqual(["e3", "e2", "e1"])
    })

    it("is disposed together with the scope it was created in", () => {
        const cleanup = vi.fn()

        const { c, dispose } = createRoot((dispose) => {
            const c = computed(() => {
                onCleanup(cleanup)
                return 1
            })
            return { c, dispose }
        })

        expect(c()).toBe(1)
        dispose()
        expect(cleanup).toHaveBeenCalledTimes(1)
    })
})

describe("peek", () => {
    it("does not create a dependency when read inside an effect", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                value.peek()
                spy()
            })
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setValue(1)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("returns the up-to-date value of a computed", () => {
        const [a, setA] = createState(1)
        const doubled = computed(() => a() * 2)

        expect(doubled.peek()).toBe(2)
        setA(2)
        expect(doubled.peek()).toBe(4)
    })
})

describe("untrack", () => {
    it("returns the value produced by the callback", () => {
        const [value] = createState(7)
        expect(untrack(() => value() + 1)).toBe(8)
    })

    it("does not track reads in effects", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                untrack(() => value())
                spy()
            })
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setValue(1)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("restores tracking after the callback returns", () => {
        const spy = vi.fn()

        const { setA, setB, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const [b, setB] = createState(0)
            effect(() => {
                untrack(a)
                b()
                spy()
            })
            return { setA, setB, dispose }
        })

        setA(1)
        expect(spy).toHaveBeenCalledTimes(1)

        setB(1)
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("restores tracking when the callback throws", () => {
        const spy = vi.fn()

        const { setB, dispose } = createRoot((dispose) => {
            const [b, setB] = createState(0)
            effect(() => {
                try {
                    untrack(() => {
                        throw Error("boom")
                    })
                } catch {
                    // ignore
                }
                b()
                spy()
            })
            return { setB, dispose }
        })

        setB(1)
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })
})

describe("onCleanup inside an effect", () => {
    it("runs the cleanup before each re-run of the effect", () => {
        const cleanup = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                value()
                onCleanup(cleanup)
            })
            return { setValue, dispose }
        })

        // The cleanup registered on the first run has not fired yet.
        expect(cleanup).not.toHaveBeenCalled()

        setValue(1)
        expect(cleanup).toHaveBeenCalledTimes(1)

        setValue(2)
        expect(cleanup).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("runs the final cleanup when the owning scope is disposed", () => {
        const order: string[] = []

        const { dispose } = createRoot((dispose) => {
            const [value] = createState(0)
            effect(() => {
                value()
                onCleanup(() => order.push("inner"))
            })
            onCleanup(() => order.push("outer"))
            return { dispose }
        })

        expect(order).toEqual([])

        dispose()

        expect(order).toEqual(["inner", "outer"])
    })

    it("skips the re-run but stays subscribed when a cleanup throws", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                spy(value())
                if (value() === 0) {
                    onCleanup(() => {
                        throw Error("boom")
                    })
                }
            })
            return { setValue, dispose }
        })

        expect(() => setValue(1)).toThrow("boom")
        expect(spy).toHaveBeenCalledTimes(1)

        setValue(2)
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })
})

describe("nested effects", () => {
    it("re-runs a nested effect without re-running its parent", () => {
        const outerSpy = vi.fn()
        const innerSpy = vi.fn()

        const { setInner, setOuter, dispose } = createRoot((dispose) => {
            const [outer, setOuter] = createState(0)
            const [inner, setInner] = createState(0)
            effect(() => {
                outer()
                outerSpy()
                effect(() => {
                    inner()
                    innerSpy()
                })
            })
            return { setInner, setOuter, dispose }
        })

        expect(outerSpy).toHaveBeenCalledTimes(1)
        expect(innerSpy).toHaveBeenCalledTimes(1)

        // A change to the inner dependency only re-runs the inner effect.
        setInner(1)
        expect(outerSpy).toHaveBeenCalledTimes(1)
        expect(innerSpy).toHaveBeenCalledTimes(2)

        // A change to the outer dependency re-runs the outer effect, which
        // recreates (and re-runs) the inner effect.
        setOuter(1)
        expect(outerSpy).toHaveBeenCalledTimes(2)
        expect(innerSpy).toHaveBeenCalledTimes(3)

        // The previous inner effect was disposed with the parent's old scope,
        // so a subsequent inner change fires exactly one inner effect, not two.
        setInner(2)
        expect(outerSpy).toHaveBeenCalledTimes(2)
        expect(innerSpy).toHaveBeenCalledTimes(4)

        dispose()
    })

    it("disposes nested effects together with the root", () => {
        const innerSpy = vi.fn()

        const { setInner, dispose } = createRoot((dispose) => {
            const [inner, setInner] = createState(0)
            effect(() => {
                effect(() => {
                    inner()
                    innerSpy()
                })
            })
            return { setInner, dispose }
        })

        expect(innerSpy).toHaveBeenCalledTimes(1)

        dispose()
        setInner(1)

        expect(innerSpy).toHaveBeenCalledTimes(1)
    })

    it("runs a nested effect on mount of the outer effect, not immediately", () => {
        const order: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                effect(() => order.push("inner"))
                order.push("outer")
            })
            return dispose
        })

        expect(order).toEqual(["outer", "inner"])
        dispose()
    })

    // https://github.com/stackblitz/alien-signals/issues/115
    it("keeps the outer effect responding to its own dependency after inner re-runs", () => {
        const [a, setA] = createState(0)
        const [b, setB] = createState(0)
        let outerRuns = 0
        let innerRuns = 0

        const dispose = createRoot((dispose) => {
            effect(() => {
                a()
                outerRuns++
                effect(() => {
                    b()
                    innerRuns++
                })
            })
            return dispose
        })

        expect(outerRuns).toBe(1)
        expect(innerRuns).toBe(1)

        setB(1)
        expect(outerRuns).toBe(1)
        expect(innerRuns).toBe(2)

        setA(1)
        expect(outerRuns).toBe(2)

        dispose()
    })
})

describe("cleanup order", () => {
    it("runs inner cleanups before outer cleanups on outer re-run", () => {
        const log: string[] = []
        const [a, setA] = createState(0)

        const dispose = createRoot((dispose) => {
            effect(() => {
                a()
                log.push("outer:run")
                effect(() => {
                    log.push("inner:run")
                    onCleanup(() => log.push("inner:cleanup"))
                })
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })
        expect(log).toEqual(["outer:run", "inner:run"])

        log.length = 0
        setA(1)
        expect(log).toEqual(["inner:cleanup", "outer:cleanup", "outer:run", "inner:run"])

        dispose()
    })

    it("runs inner cleanups before outer cleanups on dispose", () => {
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                log.push("outer:run")
                effect(() => {
                    log.push("inner:run")
                    onCleanup(() => log.push("inner:cleanup"))
                })
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })
        log.length = 0

        dispose()
        expect(log).toEqual(["inner:cleanup", "outer:cleanup"])
    })

    it("cleans up siblings in reverse creation order on dispose", () => {
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                effect(() => onCleanup(() => log.push("inner1:cleanup")))
                effect(() => onCleanup(() => log.push("inner2:cleanup")))
                effect(() => onCleanup(() => log.push("inner3:cleanup")))
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })

        dispose()
        expect(log).toEqual(["inner3:cleanup", "inner2:cleanup", "inner1:cleanup", "outer:cleanup"])
    })

    it("cleans up siblings in reverse creation order on outer re-run", () => {
        const log: string[] = []
        const [a, setA] = createState(0)

        const dispose = createRoot((dispose) => {
            effect(() => {
                a()
                effect(() => onCleanup(() => log.push("inner1:cleanup")))
                effect(() => onCleanup(() => log.push("inner2:cleanup")))
                effect(() => onCleanup(() => log.push("inner3:cleanup")))
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })
        log.length = 0

        setA(1)
        expect(log.slice(0, 4)).toEqual([
            "inner3:cleanup",
            "inner2:cleanup",
            "inner1:cleanup",
            "outer:cleanup",
        ])

        dispose()
    })

    it("cleans up three levels deepest-first on dispose", () => {
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                effect(() => {
                    effect(() => onCleanup(() => log.push("grandchild:cleanup")))
                    onCleanup(() => log.push("child:cleanup"))
                })
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })

        dispose()
        expect(log).toEqual(["grandchild:cleanup", "child:cleanup", "outer:cleanup"])
    })

    it("keeps the order on outer re-run after a prior inner-only re-run", () => {
        const [a, setA] = createState(0)
        const [b, setB] = createState(0)
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                a()
                log.push("outer:run")
                effect(() => {
                    b()
                    log.push("inner:run")
                    onCleanup(() => log.push("inner:cleanup"))
                })
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })

        setB(1) // inner re-runs alone; outer is touched via the notify chain
        log.length = 0

        setA(1)
        expect(log).toEqual(["inner:cleanup", "outer:cleanup", "outer:run", "inner:run"])

        dispose()
    })

    it("disposes a root created inside an effect before the effect's own cleanup", () => {
        const [a, setA] = createState(0)
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => {
                a()
                log.push("outer:run")
                createRoot(() => {
                    effect(() => {
                        log.push("inner:run")
                        onCleanup(() => log.push("inner:cleanup"))
                    })
                })
                onCleanup(() => log.push("outer:cleanup"))
            })
            return dispose
        })
        log.length = 0

        setA(1)
        expect(log).toEqual(["inner:cleanup", "outer:cleanup", "outer:run", "inner:run"])

        dispose()
    })

    it("cleans up sibling effects of a root in reverse creation order", () => {
        const log: string[] = []

        const dispose = createRoot((dispose) => {
            effect(() => onCleanup(() => log.push("e1:cleanup")))
            effect(() => onCleanup(() => log.push("e2:cleanup")))
            effect(() => onCleanup(() => log.push("e3:cleanup")))
            return dispose
        })

        dispose()
        expect(log).toEqual(["e3:cleanup", "e2:cleanup", "e1:cleanup"])
    })
})

describe("batch", () => {
    it("batches multiple synchronous sets into a single re-run", () => {
        const spy = vi.fn()

        const { setA, setB, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const [b, setB] = createState(0)
            effect(() => spy(a() + b()))
            return { setA, setB, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        batch(() => {
            setA(1)
            setB(1)
        })

        // Two sets, one coalesced re-run — not two.
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })

    it("re-runs once per set without a batch", () => {
        const spy = vi.fn()

        const { setA, setB, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const [b, setB] = createState(0)
            effect(() => spy(a() + b()))
            return { setA, setB, dispose }
        })

        setA(1)
        setB(1)

        expect(spy.mock.calls).toEqual([[0], [1], [2]])

        dispose()
    })

    it("collapses repeated sets of the same signal", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        batch(() => {
            setValue(1)
            setValue(2)
            setValue(3)
        })

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(3)

        dispose()
    })

    it("does not re-run when the value is restored within the batch", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        batch(() => {
            setValue(1)
            setValue(0)
        })

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("flushes once at the end of the outermost batch", () => {
        const spy = vi.fn()

        const { setA, setB, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const [b, setB] = createState(0)
            effect(() => spy(a() + b()))
            return { setA, setB, dispose }
        })

        batch(() => {
            setA(1)
            batch(() => {
                setB(1)
            })
            expect(spy).toHaveBeenCalledTimes(1)
        })

        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("exposes the latest values to reads inside the batch", () => {
        const [a, setA] = createState(1)
        const doubled = computed(() => a() * 2)

        batch(() => {
            setA(2)
            expect(a()).toBe(2)
            expect(doubled()).toBe(4)
        })
    })

    it("still flushes when the batch callback throws", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        expect(() =>
            batch(() => {
                setValue(1)
                throw Error("boom")
            }),
        ).toThrow("boom")

        expect(spy).toHaveBeenLastCalledWith(1)

        dispose()
    })
})

describe("edge cases", () => {
    it("updates a diamond dependency without intermediate glitches", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const b = computed(() => a() * 2)
            const c = computed(() => a() * 3)
            effect(() => spy(b() + c()))
            return { setA, dispose }
        })

        setA(2)

        // 1 -> (2+3)=5, then 2 -> (4+6)=10, with no glitchy 7 or 8 in between.
        expect(spy.mock.calls).toEqual([[5], [10]])

        dispose()
    })

    it("re-tracks dynamic dependencies across a conditional branch", () => {
        const spy = vi.fn()

        const { setCond, setB, setC, dispose } = createRoot((dispose) => {
            const [cond, setCond] = createState(true)
            const [b, setB] = createState("b")
            const [c, setC] = createState("c")
            effect(() => spy(cond() ? b() : c()))
            return { setCond, setB, setC, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("b")

        // Switch the branch: `b` is no longer read, `c` now is.
        setCond(false)
        expect(spy).toHaveBeenLastCalledWith("c")
        expect(spy).toHaveBeenCalledTimes(2)

        // `b` is no longer a dependency — changing it must not re-run.
        setB("b2")
        expect(spy).toHaveBeenCalledTimes(2)

        // `c` became a dependency — changing it re-runs.
        setC("c2")
        expect(spy).toHaveBeenLastCalledWith("c2")
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("notifies on every set when equals returns false", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0, { equals: () => false })
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        setValue(0)
        setValue(0)

        // Two re-runs despite the value never changing.
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("propagates a signal written inside one effect to another effect", () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const [b, setB] = createState(0)
            effect(() => setB(a() + 1))
            effect(() => spy(b()))
            return { setA, dispose }
        })

        // First effect seeds b = 2, observed by the second effect.
        expect(spy).toHaveBeenLastCalledWith(2)

        setA(10)
        expect(spy).toHaveBeenLastCalledWith(11)

        dispose()
    })

    it("stops an effect that disposes its own root", () => {
        const spy = vi.fn()
        const [n, setN] = createState(0)

        createRoot((dispose) => {
            effect(() => {
                spy(n())
                if (untrack(n) >= 2) dispose()
            })
        })

        for (const v of [1, 2, 3, 4]) {
            setN(v)
        }

        // No runs for n = 3 or n = 4.
        expect(spy.mock.calls).toEqual([[0], [1], [2]])
    })

    it("does not run an effect whose scope was disposed earlier in the same flush", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            let disposeInner = () => {}
            // immediate, so it subscribes before the inner effect and runs first
            effect(
                () => {
                    if (value() === 1) disposeInner()
                },
                { immediate: true },
            )
            createRoot((dispose) => {
                disposeInner = dispose
                effect(() => spy(value()))
            })
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setValue(1)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("throwing effects", () => {
    it("mounts sibling effects before rethrowing a mount error", () => {
        const spy = vi.fn()

        expect(() =>
            createRoot(() => {
                effect(() => {
                    throw Error("boom")
                })
                effect(spy)
            }),
        ).toThrow("boom")

        expect(spy).toHaveBeenCalledTimes(1)
        expect(getActiveScope()).toBeNull()
    })

    it("restores the current scope when an immediate effect throws", () => {
        expect(getActiveScope()).toBeNull()

        expect(() =>
            createRoot(() => {
                effect(
                    () => {
                        throw Error("boom")
                    },
                    { immediate: true },
                )
            }),
        ).toThrow("boom")

        expect(getActiveScope()).toBeNull()
    })

    it("rethrows errors from re-runs and keeps other effects running", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)

            effect(() => {
                if (value() === 1) throw Error("boom")
            })
            effect(() => spy(value()))

            return { setValue, dispose }
        })

        expect(() => setValue(1)).toThrow("boom")
        expect(spy).toHaveBeenLastCalledWith(1)

        // the throwing effect kept its subscriptions and the system stays live
        setValue(2)
        expect(spy).toHaveBeenLastCalledWith(2)
        expect(getActiveScope()).toBeNull()

        dispose()
    })

    it("keeps its dependencies when a re-run throws", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                spy(value())
                if (value() === 1) throw Error("boom")
            })
            return { setValue, dispose }
        })

        expect(() => setValue(1)).toThrow("boom")
        expect(spy).toHaveBeenCalledTimes(2)

        setValue(2)
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })
})

describe("createContext", () => {
    it("falls back to the default value when never provided", () => {
        const Ctx = createContext("fallback")

        createRoot(() => {
            expect(Ctx.use()).toBe("fallback")
        })
    })

    it("throws when used outside of a scope", () => {
        const Ctx = createContext("fallback")
        expect(() => Ctx.use()).toThrow()
    })

    it("returns the value produced by the provider callback", () => {
        const Ctx = createContext(0)
        expect(Ctx.provide(1, () => Ctx.use() + 1)).toBe(2)
    })

    it("resolves the provided value through nested scopes", () => {
        const Ctx = createContext("fallback")

        createRoot(() => {
            Ctx.provide("outer", () => {
                createRoot((dispose) => {
                    expect(Ctx.use()).toBe("outer")
                    dispose()
                }, getScope())

                Ctx.provide("inner", () => {
                    expect(Ctx.use()).toBe("inner")
                })

                expect(Ctx.use()).toBe("outer")
            })
        })
    })

    it("resolves an explicitly provided undefined value", () => {
        const Ctx = createContext<string | undefined>("fallback")

        createRoot(() => {
            Ctx.provide(undefined, () => {
                expect(Ctx.use()).toBeUndefined()
            })
        })
    })

    it("is visible inside effects created within the provider", () => {
        const Ctx = createContext("fallback")
        const spy = vi.fn()

        const dispose = createRoot((dispose) => {
            Ctx.provide("provided", () => {
                effect(() => spy(Ctx.use()))
            })
            return dispose
        })

        expect(spy).toHaveBeenLastCalledWith("provided")
        dispose()
    })

    it("creates a scope that is disposed with its parent", () => {
        const Ctx = createContext(0)
        const cleanup = vi.fn()

        const dispose = createRoot((dispose) => {
            Ctx.provide(1, () => onCleanup(cleanup))
            return dispose
        })

        expect(cleanup).not.toHaveBeenCalled()
        dispose()
        expect(cleanup).toHaveBeenCalledTimes(1)
    })
})

describe("isAccessor", () => {
    it("recognizes state, computed and custom accessors", () => {
        const [state] = createState(0)
        expect(isAccessor(state)).toBe(true)
        expect(isAccessor(computed(() => 0))).toBe(true)
        expect(isAccessor(createAccessor(() => 0))).toBe(true)
        expect(isAccessor(state.as((v) => v))).toBe(true)
    })

    it("rejects plain values and functions", () => {
        expect(isAccessor(() => 0)).toBe(false)
        expect(isAccessor(0)).toBe(false)
        expect(isAccessor(null)).toBe(false)
        expect(isAccessor({})).toBe(false)
    })
})

describe("createAccessor", () => {
    it("wraps a plain getter", () => {
        let value = 1
        const accessor = createAccessor(() => value)

        expect(accessor()).toBe(1)
        value = 2
        expect(accessor()).toBe(2)
    })

    it("tracks reactive reads made by the getter", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            const accessor = createAccessor(() => value() * 2)
            effect(() => spy(accessor()))
            return { setValue, dispose }
        })

        setValue(1)
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })

    it("reads the getter directly while nothing tracks it", () => {
        let value = 1
        const subscription = vi.fn(() => () => {})
        const accessor = createAccessor(() => value, subscription)

        expect(accessor()).toBe(1)
        value = 2
        expect(accessor()).toBe(2)
        expect(subscription).not.toHaveBeenCalled()
    })

    it("subscribes to the source when tracked and unsubscribes when unwatched", () => {
        const unsubscribe = vi.fn()
        const subscription = vi.fn(() => unsubscribe)
        const accessor = createAccessor(() => 1, subscription)

        const dispose = createRoot((dispose) => {
            effect(() => accessor())
            return dispose
        })

        expect(subscription).toHaveBeenCalledTimes(1)
        expect(unsubscribe).not.toHaveBeenCalled()

        dispose()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it("shares one subscription between multiple observers", () => {
        const unsubscribe = vi.fn()
        const subscription = vi.fn(() => unsubscribe)
        const accessor = createAccessor(() => 1, subscription)

        const dispose = createRoot((dispose) => {
            effect(() => accessor())
            effect(() => accessor())
            return dispose
        })

        expect(subscription).toHaveBeenCalledTimes(1)

        dispose()
        expect(unsubscribe).toHaveBeenCalledTimes(1)
    })

    it("re-reads the getter when the source notifies", () => {
        const spy = vi.fn()
        let value = 1
        let notify = () => {}
        const accessor = createAccessor(
            () => value,
            (callback) => {
                notify = callback
                return () => {}
            },
        )

        const dispose = createRoot((dispose) => {
            effect(() => spy(accessor()))
            return dispose
        })

        expect(spy).toHaveBeenLastCalledWith(1)

        value = 2
        notify()
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })

    it("caches the value between notifications while tracked", () => {
        const getter = vi.fn(() => 1)
        const accessor = createAccessor(getter, () => () => {})

        const dispose = createRoot((dispose) => {
            effect(() => accessor())
            return dispose
        })
        expect(getter).toHaveBeenCalledTimes(1)

        accessor()
        accessor.peek()
        expect(getter).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("does not notify observers when the value is unchanged", () => {
        const spy = vi.fn()
        let notify = () => {}
        const accessor = createAccessor(
            () => 1,
            (callback) => {
                notify = callback
                return () => {}
            },
        )

        const dispose = createRoot((dispose) => {
            effect(() => spy(accessor()))
            return dispose
        })

        notify()
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("re-subscribes when tracked again after being unwatched", () => {
        const subscription = vi.fn(() => () => {})
        const accessor = createAccessor(() => 1, subscription)

        const first = createRoot((dispose) => {
            effect(() => accessor())
            return dispose
        })
        first()

        const second = createRoot((dispose) => {
            effect(() => accessor())
            return dispose
        })
        second()

        expect(subscription).toHaveBeenCalledTimes(2)
    })

    it("rethrows getter errors to tracked readers", () => {
        let fail = true
        let notify = () => {}
        const accessor = createAccessor(
            () => {
                if (fail) throw Error("boom")
                return 1
            },
            (callback) => {
                notify = callback
                return () => {}
            },
        )

        expect(() => accessor()).toThrow("boom")

        expect(() =>
            createRoot(() => {
                effect(() => accessor())
            }),
        ).toThrow("boom")

        fail = false
        notify()
        expect(accessor()).toBe(1)
    })

    it("formats as a string via peek", () => {
        const accessor = createAccessor(() => "value")
        expect(accessor.toString()).toBe("Accessor { value }")
    })

    it("warns when implicitly converted to a primitive", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        const accessor = createAccessor(() => 1)

        expect(`${accessor}`).toBe("Accessor { 1 }")
        expect(warn).toHaveBeenCalledTimes(1)

        warn.mockRestore()
    })
})

describe("Accessor.as", () => {
    it("derives a transformed value", () => {
        const [n] = createState(2)
        const doubled = n.as((v) => v * 2)
        expect(doubled()).toBe(4)
    })

    it("reflects source updates", () => {
        const [n, setN] = createState(2)
        const doubled = n.as((v) => v * 2)
        setN(10)
        expect(doubled()).toBe(20)
    })

    it("chains transformations", () => {
        const [n] = createState(1)
        const result = n.as((v) => v + 1).as((v) => `${v * 10}`)
        expect(result()).toBe("20")
    })

    it("does not memoize the transformation", () => {
        const transform = vi.fn((v: number) => v * 2)
        const [n] = createState(1)
        const doubled = n.as(transform)

        doubled()
        doubled()

        expect(transform).toHaveBeenCalledTimes(2)
    })

    it("notifies subscribers when the source changes", () => {
        const [n, setN] = createState(0)
        const doubled = n.as((v) => v * 2)
        const observer = vi.fn()

        const unsubscribe = subscribe(doubled, observer)
        setN(1)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
        setN(2)
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("is tracked as a dependency in effects", () => {
        const spy = vi.fn()

        const { setN, dispose } = createRoot((dispose) => {
            const [n, setN] = createState(1)
            const doubled = n.as((v) => v * 2)
            effect(() => spy(doubled()))
            return { setN, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(2)

        setN(3)
        expect(spy).toHaveBeenLastCalledWith(6)

        dispose()
    })

    it("tracks a chained transformation of a computed", () => {
        const spy = vi.fn()

        const { setN, dispose } = createRoot((dispose) => {
            const [n, setN] = createState(1)
            const label = computed(() => n() + 1).as((v) => `${v}`)
            effect(() => spy(label()))
            return { setN, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("2")

        setN(3)
        expect(spy).toHaveBeenLastCalledWith("4")

        dispose()
    })

    it("tracks a transformed external accessor", () => {
        const spy = vi.fn()
        let value = 1
        let notify = () => {}
        const external = createAccessor(
            () => value,
            (callback) => {
                notify = callback
                return () => {}
            },
        )

        const dispose = createRoot((dispose) => {
            effect(() => spy(external.as((v) => v * 10)()))
            return dispose
        })

        expect(spy).toHaveBeenLastCalledWith(10)

        value = 2
        notify()
        expect(spy).toHaveBeenLastCalledWith(20)

        dispose()
    })

    it("does not track reads made inside the transformation", () => {
        const spy = vi.fn()

        const { setOther, dispose } = createRoot((dispose) => {
            const [n] = createState(1)
            const [other, setOther] = createState(1)
            const sum = n.as((v) => v + other())
            effect(() => spy(sum()))
            return { setOther, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setOther(2)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("does not track when peeked", () => {
        const spy = vi.fn()

        const { setN, dispose } = createRoot((dispose) => {
            const [n, setN] = createState(1)
            const doubled = n.as((v) => v * 2)
            effect(() => {
                doubled.peek()
                spy()
            })
            return { setN, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setN(2)
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("keeps the accessor type", () => {
        const [n] = createState(1)
        const doubled: Accessor<number> = n.as((v) => v * 2)
        expect(isAccessor(doubled)).toBe(true)
    })
})
