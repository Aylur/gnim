import { describe, it, expect, vi } from "vitest"
import GObject from "gi://GObject?version=2.0"
const {
    Object: Obj,
    signal_connect: connect,
    signal_handler_disconnect: disconnect,
    signal_emit_by_name: emit,
} = GObject

describe("GObject mock signal system", () => {
    it("invokes a connected handler when the signal is emitted", () => {
        const object = new Obj()
        const handler = vi.fn()

        connect(object, "my-signal", handler)
        emit(object, "my-signal")

        expect(handler).toHaveBeenCalledTimes(1)
    })

    it("passes the emitter as the first argument, followed by emitted args", () => {
        const object = new Obj()
        const handler = vi.fn()

        connect(object, "changed", handler)
        emit(object, "changed", 42, "hello")

        expect(handler).toHaveBeenCalledWith(object, 42, "hello")
    })

    it("returns a distinct handler id from each connect", () => {
        const object = new Obj()

        const id1 = connect(object, "a", () => {})
        const id2 = connect(object, "b", () => {})

        expect(typeof id1).toBe("number")
        expect(id1).not.toBe(id2)
    })

    it("stops invoking a handler once it is disconnected", () => {
        const object = new Obj()
        const handler = vi.fn()

        const id = connect(object, "tick", handler)
        emit(object, "tick")
        disconnect(object, id)
        emit(object, "tick")

        expect(handler).toHaveBeenCalledTimes(1)
    })

    it("only invokes handlers for the emitted signal", () => {
        const object = new Obj()
        const onFoo = vi.fn()
        const onBar = vi.fn()

        connect(object, "foo", onFoo)
        connect(object, "bar", onBar)
        emit(object, "foo")

        expect(onFoo).toHaveBeenCalledTimes(1)
        expect(onBar).not.toHaveBeenCalled()
    })

    it("isolates handlers per instance", () => {
        const a = new Obj()
        const b = new Obj()
        const onA = vi.fn()
        const onB = vi.fn()

        connect(a, "ping", onA)
        connect(b, "ping", onB)
        emit(a, "ping")

        expect(onA).toHaveBeenCalledTimes(1)
        expect(onB).not.toHaveBeenCalled()
    })

    it("invokes multiple handlers connected to the same signal in order", () => {
        const object = new Obj()
        const calls: string[] = []

        connect(object, "run", () => calls.push("first"))
        connect(object, "run", () => calls.push("second"))
        emit(object, "run")

        expect(calls).toEqual(["first", "second"])
    })
})
