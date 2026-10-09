import GObject from "gi://GObject?version=2.0"
import { describe, expect, it, vi } from "vitest"
import {
    createRoot,
    createState,
    effect,
    isAccessor,
    subscribe,
    type Accessor,
} from "../jsx/reactive.js"
import { bind, connectSignal, createStore, prop } from "../jsx/store.js"

const emit = GObject.signal_emit_by_name

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
        expect(isAccessor(firstName)).toBe(true)
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

    it("falls back to the kebab-cased property name", () => {
        class Kebab extends GObject.Object {
            "some-value" = "kebab"
        }

        const kebab = new Kebab()
        const value = bind(kebab, "someValue" as never)
        expect(value()).toBe("kebab")
    })

    it("throws when reading an unknown property", () => {
        const person = new Person()
        const missing = bind(person, "missing" as never)
        expect(() => missing()).toThrow(/cannot get property "missing"/)
    })

    it("reads the live value while nothing tracks it", () => {
        const person = new Person()
        const name = bind(person, "firstName")

        person.firstName = "John"
        expect(name()).toBe("John")
    })

    it("connects to the notify signal only while tracked", () => {
        const connect = vi.spyOn(GObject, "signal_connect")
        const disconnect = vi.spyOn(GObject, "signal_handler_disconnect")

        const person = new Person()
        const name = bind(person, "firstName")

        name()
        expect(connect).not.toHaveBeenCalled()

        const dispose = createRoot((dispose) => {
            effect(() => name())
            effect(() => name())
            return dispose
        })

        expect(connect).toHaveBeenCalledTimes(1)
        expect(connect).toHaveBeenCalledWith(person, "notify::first-name", expect.any(Function))
        expect(disconnect).not.toHaveBeenCalled()

        dispose()
        expect(disconnect).toHaveBeenCalledTimes(1)

        connect.mockRestore()
        disconnect.mockRestore()
    })

    it("notifies subscribers on the kebab-cased notify signal", () => {
        const person = new Person()
        const name = bind(person, "firstName")
        const observer = vi.fn()

        const unsubscribe = subscribe(name, observer)
        person.setFirstName("John")
        expect(observer).toHaveBeenCalledTimes(1)
        expect(name()).toBe("John")

        unsubscribe()
        person.setFirstName("Jill")
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("does not notify when the property value is unchanged", () => {
        const person = new Person()
        const name = bind(person, "firstName")
        const observer = vi.fn()

        const unsubscribe = subscribe(name, observer)
        emit(person, "notify::first-name")
        expect(observer).not.toHaveBeenCalled()

        unsubscribe()
    })

    it("re-runs effects when the property changes", () => {
        const spy = vi.fn()
        const person = new Person()
        const name = bind(person, "firstName")

        const { dispose } = createRoot((dispose) => {
            effect(() => spy(name()))
            return { dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("Jane")

        person.setFirstName("John")
        expect(spy).toHaveBeenLastCalledWith("John")

        dispose()
        person.setFirstName("Jill")

        expect(spy).toHaveBeenCalledTimes(2)
    })

    it("transforms the property with as", () => {
        const spy = vi.fn()
        const person = new Person()
        const upper = bind(person, "firstName").as((name) => name.toUpperCase())

        expect(upper()).toBe("JANE")

        const dispose = createRoot((dispose) => {
            effect(() => spy(upper()))
            return dispose
        })

        person.setFirstName("John")
        expect(spy).toHaveBeenLastCalledWith("JOHN")

        dispose()
    })

    it("reads and tracks a store property", () => {
        const store = createStore({ value: 1 })
        const value = bind(store, "value")
        const observer = vi.fn()

        expect(value()).toBe(1)

        const unsubscribe = subscribe(value, observer)
        store.value = 2

        expect(value()).toBe(2)
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    it("follows a chain of properties", () => {
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
        expect(spy).toHaveBeenLastCalledWith("b")

        // Swapping the intermediate object re-runs with the new leaf value.
        const other = new Child()
        other.value = "c"
        parent.child = other
        emit(parent, "notify::child")
        expect(spy).toHaveBeenLastCalledWith("c")
        expect(spy).toHaveBeenCalledTimes(3)

        // The old child is no longer tracked.
        child.value = "d"
        emit(child, "notify::value")
        expect(spy).toHaveBeenCalledTimes(3)

        dispose()
    })

    it("resolves to null when an intermediate property is null", () => {
        const parent = new Parent()
        const value: Accessor<string | null> = bind(parent, "child", "value")
        expect(value()).toBeNull()
    })

    it("resolves to undefined when an intermediate property is undefined", () => {
        class LooseParent extends GObject.Object {
            child?: Child
        }

        const spy = vi.fn()
        const parent = new LooseParent()
        const value = bind(parent, "child", "value")

        expect(() => spy(value())).not.toThrow()
        expect(spy).toHaveBeenLastCalledWith(undefined)

        const { dispose } = createRoot((dispose) => {
            effect(() => spy(value()))
            return { dispose }
        })

        // The chain recovers once the intermediate is set.
        parent.child = new Child()
        emit(parent, "notify::child")

        expect(spy).toHaveBeenLastCalledWith("a")

        dispose()
    })

    it("follows a chain through nested stores", () => {
        const spy = vi.fn()
        const store = createStore({
            nested: createStore({ value: "a" }),
        })

        const dispose = createRoot((dispose) => {
            effect(() => spy(bind(store, "nested", "value")()))
            return dispose
        })

        expect(spy).toHaveBeenLastCalledWith("a")

        store.nested.value = "b"
        expect(spy).toHaveBeenLastCalledWith("b")

        store.nested = createStore({ value: "c" })
        expect(spy).toHaveBeenLastCalledWith("c")

        dispose()
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

    it("disconnects when the owning effect re-runs", () => {
        const button = new Button()
        const handler = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState(0)
            effect(() => {
                value()
                connectSignal(button, "clicked", handler)
            })
            return { setValue, dispose }
        })

        setValue(1)
        emit(button, "clicked", 0, 0)

        expect(handler).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("throws outside of a scope", () => {
        const button = new Button()
        expect(() => connectSignal(button, "clicked", vi.fn())).toThrow()
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

    it("enumerates its fields", () => {
        const store = createStore({
            a: 1,
            get b() {
                return this.a + 1
            },
        })
        expect(Object.keys(store)).toEqual(["a", "b"])
    })

    it("notifies subscribers of the changed field only", () => {
        const store = createStore({ a: 0, b: 0 })
        const observer = vi.fn()

        const unsubscribe = subscribe(() => store.a, observer)
        store.b = 1
        expect(observer).not.toHaveBeenCalled()

        store.a = 1
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
        store.a = 2
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("does not notify when a field is set to an equal value", () => {
        const store = createStore({ a: 0 })
        const observer = vi.fn()

        const unsubscribe = subscribe(() => store.a, observer)
        store.a = 0
        expect(observer).not.toHaveBeenCalled()

        unsubscribe()
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

    it("memoizes getters", () => {
        const body = vi.fn()
        const store = createStore({
            value: 2,
            get double() {
                body()
                return this.value * 2
            },
        })

        expect(store.double).toBe(4)
        expect(store.double).toBe(4)
        expect(body).toHaveBeenCalledTimes(1)

        store.value = 3
        expect(store.double).toBe(6)
        expect(body).toHaveBeenCalledTimes(2)
    })

    it("notifies subscribers of getter fields", () => {
        const store = createStore({
            value: 2,
            get double() {
                return this.value * 2
            },
        })
        const observer = vi.fn()

        const unsubscribe = subscribe(() => store.double, observer)
        store.value = 3

        expect(observer).toHaveBeenCalledTimes(1)
        expect(store.double).toBe(6)

        unsubscribe()
        store.value = 4
        expect(observer).toHaveBeenCalledTimes(1)
    })

    it("only notifies getter subscribers when the derived value changes", () => {
        const store = createStore({
            value: 1,
            get isEven() {
                return this.value % 2 === 0
            },
        })
        const observer = vi.fn()

        const unsubscribe = subscribe(() => store.isEven, observer)

        store.value = 3
        expect(observer).not.toHaveBeenCalled()

        store.value = 4
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })

    it("supports setters alongside getters", () => {
        const store = createStore({
            value: 1,
            get double() {
                return this.value * 2
            },
            set double(v: number) {
                this.value = v / 2
            },
        })

        store.double = 10
        expect(store.value).toBe(5)
        expect(store.double).toBe(10)
    })

    it("keeps methods as plain properties", () => {
        const store = createStore({
            value: 1,
            increment() {
                this.value++
            },
        })

        store.increment()
        expect(store.value).toBe(2)
    })

    it("binds getter fields", () => {
        const spy = vi.fn()

        const { store, dispose } = createRoot((dispose) => {
            const store = createStore({
                value: 1,
                get double() {
                    return this.value * 2
                },
            })
            effect(() => spy(bind(store, "double")()))
            return { store, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(2)

        store.value = 5
        expect(spy).toHaveBeenLastCalledWith(10)

        dispose()
    })

    it("tracks store properties in effects", () => {
        const spy = vi.fn()

        const { store, dispose } = createRoot((dispose) => {
            const store = createStore({ count: 0 })
            effect(() => spy(store.count))
            return { store, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith(0)

        store.count = 1
        expect(spy).toHaveBeenLastCalledWith(1)

        dispose()
    })

    it("tracks getters in effects", () => {
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
        expect(spy).toHaveBeenLastCalledWith(-5)

        dispose()
    })

    it("does not track when a bound property is peeked", () => {
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
        expect(spy).toHaveBeenCalledTimes(1)

        dispose()
    })

    it("supports nested stores", () => {
        const store = createStore({
            nested: createStore({ value: "a" }),
        })
        const observer = vi.fn()

        const unsubscribe = subscribe(() => store.nested.value, observer)
        store.nested.value = "b"

        expect(store.nested.value).toBe("b")
        expect(observer).toHaveBeenCalledTimes(1)

        unsubscribe()
    })
})

describe("prop", () => {
    it("wraps a plain value in an accessor", () => {
        const value = prop(5)
        expect(isAccessor(value)).toBe(true)
        expect(value()).toBe(5)
    })

    it("passes accessors through reactively", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState("a")
            effect(() => spy(prop(value)()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenLastCalledWith("a")

        setValue("b")
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

    it("does not re-run observers while the fallback stays in place", () => {
        const spy = vi.fn()

        const { setValue, dispose } = createRoot((dispose) => {
            const [value, setValue] = createState<string | null>(null)
            effect(() => spy(prop(value, "fallback")()))
            return { setValue, dispose }
        })

        expect(spy).toHaveBeenCalledTimes(1)

        setValue(undefined as unknown as null)
        expect(spy).toHaveBeenCalledTimes(1)

        setValue("set")
        expect(spy).toHaveBeenLastCalledWith("set")

        dispose()
    })
})
