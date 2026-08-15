import { describe, it, expect, vi } from "vitest"
import GObject from "gi://GObject?version=2.0"
import {
    createRoot,
    onCleanup,
    createState,
    effect,
    computed,
    untrack,
    getScope,
    isAccessor,
    bind,
    connectSignal,
    createStore,
    createContext,
    prop,
    Scope,
} from "../jsx/reactive.js"

const emit = GObject.signal_emit_by_name

// Effect re-runs are scheduled on the microtask queue, so tests need to yield
// to let the scheduler flush before asserting the observed value.
const flush = () => new Promise<void>((resolve) => setTimeout(resolve))

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

    it("runs cleanups registered inside it when disposed", () => {
        const cleanup = vi.fn()

        createRoot((dispose) => {
            onCleanup(cleanup)
            dispose()
        })

        expect(cleanup).toHaveBeenCalledTimes(1)
    })

    it("stops effects created inside it once disposed", async () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
        setValue(1)
        await flush()

        expect(spy).toHaveBeenCalledTimes(1)
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

    it("notifies subscribers when the value changes", () => {
        const [value, setValue] = createState(0)
        const observer = vi.fn()

        value.subscribe(observer)
        setValue(1)

        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("stops notifying after unsubscribing", () => {
        const [value, setValue] = createState(0)
        const observer = vi.fn()

        const unsubscribe = value.subscribe(observer)
        setValue(1)
        unsubscribe()
        setValue(2)

        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("does not notify when the value is unchanged (Object.is)", () => {
        const [value, setValue] = createState(5)
        const observer = vi.fn()

        value.subscribe(observer)
        setValue(5)

        expect(observer).not.toHaveBeenCalled()
    })

    it("honors a custom equality function", () => {
        const [value, setValue] = createState({ id: 1 }, { equals: (a, b) => a.id === b.id })
        const observer = vi.fn()

        value.subscribe(observer)
        setValue({ id: 1 })
        expect(observer).not.toHaveBeenCalled()

        setValue({ id: 2 })
        expect(observer).toHaveBeenCalledTimes(1)
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

    it("re-runs when a tracked dependency changes", async () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenNthCalledWith(1, 0)

        setValue(1)
        await flush()

        expect(spy).toHaveBeenNthCalledWith(2, 1)

        dispose()
    })

    it("receives the previous returned value", async () => {
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
        await flush()

        expect(seen).toEqual([undefined, 1])

        dispose()
    })

    it("does not re-run for untracked reads", async () => {
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
        await flush()
        expect(spy).toHaveBeenCalledTimes(1)

        setTracked(1)
        await flush()
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
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

    it("recomputes when a dependency changes", async () => {
        const { setA, value, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const doubled = computed(() => a() * 2)
            let value = 0
            effect(() => (value = doubled()))
            return { setA, value: () => value, dispose }
        })

        expect(value()).toBe(2)

        setA(5)
        await flush()

        expect(value()).toBe(10)

        dispose()
    })

    it("only notifies observers when the computed value changes", async () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const isEven = computed(() => a() % 2 === 0)
            effect(() => spy(isEven()))
            return { setA, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setA(3) // 1 -> 3, still odd
        await flush()
        expect(spy).toHaveBeenCalledTimes(1)

        setA(4) // odd -> even
        await flush()
        expect(spy).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("only notifies subscribers when the computed value changes", async () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const isEven = computed(() => a() % 2 === 0)
            isEven.subscribe(() => {
                spy()
            })
            return { setA, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(0)

        setA(3) // 1 -> 3, still odd
        await flush()
        expect(spy).toHaveBeenCalledTimes(0)

        setA(4) // odd -> even
        await flush()
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("chains derived accessors", async () => {
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
        await flush()

        expect(value()).toBe(50)

        dispose()
    })
})

describe("peek", () => {
    it("does not create a dependency when read inside an effect", async () => {
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
        await flush()

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("onCleanup inside an effect", () => {
    it("runs the cleanup before each re-run of the effect", async () => {
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
        await flush()
        expect(cleanup).toHaveBeenCalledTimes(1)

        setValue(2)
        await flush()
        expect(cleanup).toHaveBeenCalledTimes(2)

        dispose()
    })

    it("runs the final cleanup when the owning scope is disposed", async () => {
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
})

describe("nested effects", () => {
    it("re-runs a nested effect without re-running its parent", async () => {
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
        await flush()
        expect(outerSpy).toHaveBeenCalledTimes(1)
        expect(innerSpy).toHaveBeenCalledTimes(2)

        // A change to the outer dependency re-runs the outer effect, which
        // recreates (and re-runs) the inner effect.
        setOuter(1)
        await flush()
        expect(outerSpy).toHaveBeenCalledTimes(2)
        expect(innerSpy).toHaveBeenCalledTimes(3)

        // The previous inner effect was disposed with the parent's old scope,
        // so a subsequent inner change fires exactly one inner effect, not two.
        setInner(2)
        await flush()
        expect(outerSpy).toHaveBeenCalledTimes(2)
        expect(innerSpy).toHaveBeenCalledTimes(4)

        dispose()
    })

    it("disposes nested effects together with the root", async () => {
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
        await flush()

        expect(innerSpy).toHaveBeenCalledTimes(1)
    })
})

describe("untrack", () => {
    it("returns the value produced by the callback", () => {
        const [value] = createState(7)
        expect(untrack(() => value() + 1)).toBe(8)
    })

    it("does not track reads in effects", async () => {
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
        await flush()

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("edge cases", () => {
    it("batches multiple synchronous sets into a single re-run", async () => {
        const spy = vi.fn()

        const { setA, setB, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(0)
            const [b, setB] = createState(0)
            effect(() => spy(a() + b()))
            return { setA, setB, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setA(1)
        setB(1)
        await flush()

        // Two sets, one coalesced re-run — not two.
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(2)

        dispose()
    })

    it("collapses repeated sets of the same signal before flushing", async () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        setValue(1)
        setValue(2)
        setValue(3)
        await flush()

        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith(3)

        dispose()
    })

    it("updates a diamond dependency without intermediate glitches", async () => {
        const spy = vi.fn()

        const { setA, dispose } = createRoot((dispose) => {
            const [a, setA] = createState(1)
            const b = computed(() => a() * 2)
            const c = computed(() => a() * 3)
            effect(() => spy(b() + c()))
            return { setA, dispose }
        })

        setA(2)
        await flush()

        // 1 -> (2+3)=5, then 2 -> (4+6)=10, with no glitchy 7 or 8 in between.
        expect(spy.mock.calls).toEqual([[5], [10]])

        dispose()
    })

    it("re-tracks dynamic dependencies across a conditional branch", async () => {
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
        await flush()
        expect(spy).toHaveBeenLastCalledWith("c")
        expect(spy).toHaveBeenCalledTimes(2)

        // `b` is no longer a dependency — changing it must not re-run.
        setB("b2")
        await flush()
        expect(spy).toHaveBeenCalledTimes(2)

        // `c` became a dependency — changing it re-runs.
        setC("c2")
        await flush()
        expect(spy).toHaveBeenLastCalledWith("c2")
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("memoizes a computed across repeated reads", () => {
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

    it("short-circuits a computed chain when an intermediate value is stable", async () => {
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
        await flush()
        expect(spy).toHaveBeenCalledTimes(1)

        setA(2) // parity flips to 0 -> label becomes "even"
        await flush()
        expect(spy).toHaveBeenCalledTimes(2)
        expect(spy).toHaveBeenLastCalledWith("even")

        dispose()
    })

    it("notifies on every set when equals returns false", async () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0, { equals: () => false })
            effect(() => spy(value()))
            return { setValue, dispose }
        })

        setValue(0)
        await flush()
        setValue(0)
        await flush()

        // Two re-runs despite the value never changing.
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("propagates a signal written inside one effect to another effect", async () => {
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
        await flush()

        expect(spy).toHaveBeenLastCalledWith(11)

        dispose()
    })

    it("warns and runs once for an effect created outside a root", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
        const spy = vi.fn()

        effect(spy)

        expect(spy).toHaveBeenCalledTimes(1)
        expect(warn).toHaveBeenCalled()

        warn.mockRestore()
    })

    it("stops an effect that disposes its own root", async () => {
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
            await flush()
        }

        // Desired behavior: no runs for n = 3 or n = 4.
        expect(spy.mock.calls).toEqual([[0], [1], [2]])
    })
})

describe("throwing effects", () => {
    it("propagates a mount error and restores the current scope", () => {
        expect(Scope.current).toBeNull()

        expect(() =>
            createRoot(() => {
                effect(() => {
                    throw Error("boom")
                })
            }),
        ).toThrow("boom")

        expect(Scope.current).toBeNull()
    })

    it("restores the current scope when an immediate effect throws", () => {
        expect(Scope.current).toBeNull()

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

        expect(Scope.current).toBeNull()
    })

    it("logs errors thrown during re-runs and keeps other effects running", async () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => {})
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)

            effect(() => {
                if (value() === 1) throw Error("boom")
            })
            effect(() => spy(value()))

            return { setValue, dispose }
        })

        setValue(1)
        await flush()

        expect(error).toHaveBeenCalled()
        expect(spy).toHaveBeenLastCalledWith(1)

        // the throwing effect kept its subscriptions and the system stays live
        setValue(2)
        await flush()

        expect(spy).toHaveBeenLastCalledWith(2)
        expect(Scope.current).toBeNull()

        error.mockRestore()
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

        const unsubscribe = doubled.subscribe(observer)
        setN(1)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
        setN(2)
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("is tracked as a dependency in effects", async () => {
        const spy = vi.fn()

        const { setN, dispose } = createRoot((dispose) => {
            const [n, setN] = createState(1)
            const doubled = n.as((v) => v * 2)
            effect(() => spy(doubled()))
            return { setN, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(2)

        setN(3)
        await flush()

        expect(spy).toHaveBeenLastCalledWith(6)

        dispose()
    })

    it("does not track when peeked", async () => {
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
        await flush()

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })
})

describe("bind", () => {
    class Person extends GObject.Object {
        firstName = "Jane"

        setFirstName(name: string) {
            this.firstName = name
            emit(this, "notify::first-name")
        }
    }

    class Child extends GObject.Object {
        value = "a"
    }

    class Parent extends GObject.Object {
        child: Child | null = null
    }

    it("reads a GObject property", () => {
        const person = new Person()
        const firstName = bind(person, "firstName")
        expect(firstName()).toBe("Jane")
    })

    it("prefers a get_* getter over the plain property", () => {
        class Celsius extends GObject.Object {
            tempName = 4

            get_temp_name() {
                return this.tempName * 10
            }
        }

        const celsius = new Celsius()
        const tempName = bind(celsius, "tempName")
        expect(tempName()).toBe(40)
    })

    it("notifies subscribers on the kebab-cased notify signal", () => {
        const person = new Person()
        const name = bind(person, "firstName")
        const observer = vi.fn()

        const unsubscribe = name.subscribe(observer)
        person.setFirstName("John")
        expect(observer).toHaveBeenCalledTimes(1)
        expect(name()).toBe("John")

        unsubscribe()
        person.setFirstName("Jill")
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("re-runs effects when the property changes", async () => {
        const spy = vi.fn()
        const person = new Person()
        const name = bind(person, "firstName")

        const { dispose } = createRoot((dispose) => {
            effect(() => spy(name()))
            return { dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("Jane")

        person.setFirstName("John")
        await flush()

        expect(spy).toHaveBeenLastCalledWith("John")

        dispose()
        person.setFirstName("Jill")
        await flush()

        expect(spy).toHaveBeenCalledTimes(2)
    })

    it("reads and tracks a store property", () => {
        const store = createStore({ value: 1 })
        const value = bind(store, "value")
        const observer = vi.fn()

        expect(value()).toBe(1)

        value.subscribe(observer)
        store.value = 2

        expect(value()).toBe(2)
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("follows a chain of properties", async () => {
        const spy = vi.fn()
        const child = new Child()

        const { parent, dispose } = createRoot((dispose) => {
            const parent = new Parent()
            parent.child = child
            effect(() => spy(bind(parent, "child", "value")()))
            return { parent, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("a")

        // A change on the leaf object re-runs.
        child.value = "b"
        emit(child, "notify::value")
        await flush()
        expect(spy).toHaveBeenLastCalledWith("b")

        // Swapping the intermediate object re-runs with the new leaf value.
        const other = new Child()
        other.value = "c"
        parent.child = other
        emit(parent, "notify::child")
        await flush()
        expect(spy).toHaveBeenLastCalledWith("c")
        expect(spy).toHaveBeenCalledTimes(3)

        // The old child is no longer tracked.
        child.value = "d"
        emit(child, "notify::value")
        await flush()
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("resolves to null when an intermediate property is null", () => {
        const parent = new Parent()
        expect(bind(parent, "child", "value")()).toBeNull()
    })
})

describe("connectSignal", () => {
    class Button extends GObject.Object {
        declare readonly $signals: GObject.Object.SignalSignatures & {
            clicked: (x: number, y: number) => void
        }
    }

    it("invokes the handler without the emitter argument", () => {
        createRoot((dispose) => {
            const button = new Button()
            const handler = vi.fn()

            connectSignal(button, "clicked", handler)
            emit(button, "clicked", 1, 2)

            expect(handler).toHaveBeenCalledTimes(1)
            expect(handler).toHaveBeenCalledWith(1, 2)

            dispose()
        })
    })

    it("disconnects when the owning scope is disposed", () => {
        const button = new Button()
        const handler = vi.fn()

        createRoot((dispose) => {
            connectSignal(button, "clicked", handler)
            dispose()
        })

        emit(button, "clicked", 0, 0)

        expect(handler).not.toHaveBeenCalled()
    })
})

describe("createStore", () => {
    it("exposes initial values as plain properties", () => {
        const store = createStore({ count: 1, name: "gnim" })
        expect(store.count).toBe(1)
        expect(store.name).toBe("gnim")
    })

    it("updates values through property assignment", () => {
        const store = createStore({ count: 0 })
        store.count = 5
        expect(store.count).toBe(5)
    })

    it("notifies subscribers of the changed key only", () => {
        const store = createStore({ a: 0, b: 0 })
        const observer = vi.fn()

        const unsubscribe = store.subscribe("a", observer)
        store.b = 1
        expect(observer).not.toHaveBeenCalled()

        store.a = 1
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
        store.a = 2
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("computes getters from other fields", () => {
        const store = createStore({
            value: 2,
            get double() {
                return this.value * 2
            },
        })

        expect(store.double).toBe(4)

        store.value = 10
        expect(store.double).toBe(20)
    })

    it("tracks store properties in effects", async () => {
        const spy = vi.fn()

        const { store, dispose } = createRoot((dispose) => {
            const store = createStore({ count: 0 })
            effect(() => spy(store.count))
            return { store, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(0)

        store.count = 1
        await flush()

        expect(spy).toHaveBeenLastCalledWith(1)

        dispose()
    })

    it("tracks getters in effects", async () => {
        const spy = vi.fn()

        const { store, dispose } = createRoot((dispose) => {
            const store = createStore({
                value: 1,
                get negated() {
                    return -this.value
                },
            })
            effect(() => spy(store.negated))
            return { store, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(-1)

        store.value = 5
        await flush()

        expect(spy).toHaveBeenLastCalledWith(-5)

        dispose()
    })

    it("does not track when a bound property is peeked", async () => {
        const spy = vi.fn()

        const { store, dispose } = createRoot((dispose) => {
            const store = createStore({ count: 0 })
            const count = bind(store, "count")
            effect(() => {
                count.peek()
                spy()
            })
            return { store, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        store.count = 1
        await flush()

        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("supports nested stores", () => {
        const store = createStore({
            nested: createStore({ value: "a" }),
        })
        const observer = vi.fn()

        store.nested.subscribe("value", observer)
        store.nested.value = "b"

        expect(store.nested.value).toBe("b")
        expect(observer).toHaveBeenCalledTimes(1)
    })
})

describe("prop", () => {
    it("wraps a plain value in an accessor", () => {
        const value = prop(5)
        expect(isAccessor(value)).toBe(true)
        expect(value()).toBe(5)
    })

    it("passes accessors through reactively", async () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState("a")
            effect(() => spy(prop(value)()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("a")

        setValue("b")
        await flush()

        expect(spy).toHaveBeenLastCalledWith("b")

        dispose()
    })

    it("falls back when a plain value is nullish", () => {
        const value = prop<string | undefined>(undefined, "fallback")
        expect(value()).toBe("fallback")
    })

    it("falls back when an accessor's value is nullish", () => {
        const [value, setValue] = createState<string | null>(null)
        const withFallback = prop(value, "fallback")

        expect(withFallback()).toBe("fallback")

        setValue("set")
        expect(withFallback()).toBe("set")
    })

    it("keeps a value that is not nullish", () => {
        const value = prop("value", "fallback")
        expect(value()).toBe("value")
    })
})
