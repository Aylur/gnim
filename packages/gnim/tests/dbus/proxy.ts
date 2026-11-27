import { afterAll, describe, expect, it, run } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { bind } from "../../lib/jsx/store.js"
import {
    ComExampleInterface,
    expectSignal,
    INITIAL,
    sleep,
    UPDATED,
    waitForServiceToAppear,
} from "./interface.js"

await waitForServiceToAppear()
const proxy = await ComExampleInterface.proxy()

describe("property access flags", () => {
    it("reading a write-only property throws", () => {
        expect(() => void proxy.WriteOnlyProperty).toThrow()
    })

    it("writing a read-only property throws", () => {
        expect(() => {
            // @ts-expect-error read-only property
            proxy.ReadOnlyProperty = 0
        }).toThrow()
    })
})

describe("methods", () => {
    it("methods with no out args resolve []", async () => {
        expect(await proxy.NoArgsNoReturn()).toEqual([])
        expect(await proxy.AsyncNoReturn()).toEqual([])
    })

    it("methods return their out tuple", async () => {
        expect(await proxy.Echo("hello")).toEqual(["hello"])
        expect(await proxy.AsyncEcho("hello")).toEqual(["hello"])
    })

    it("container in args", async () => {
        expect(await proxy.Concat(["a", "b", "c"], "-")).toEqual(["a-b-c"])
    })
})

describe("method errors", () => {
    it("throwing sync implementation rejects with a GLib.Error", async () => {
        await expect(proxy.SyncFail()).rejects.toThrow(GLib.Error)
    })

    it("rejecting async implementation rejects with a GLib.Error", async () => {
        await expect(proxy.AsyncFail()).rejects.toThrow(GLib.Error)
    })

    it("custom dbus error rejects with a GLib.Error", async () => {
        await expect(proxy.CustomFail()).rejects.toThrow(GLib.Error)
    })
})

describe("signals", () => {
    it("are emitted as gobject signals", async () => {
        const noArgSignal = expectSignal(proxy, "no-arg-signal")
        const stringSignal = expectSignal(proxy, "string-signal")
        const multiArgSignal = expectSignal(proxy, "multi-arg-signal")
        await proxy.EmitSignals(UPDATED.SignalString, UPDATED.SignalCount)
        expect(await noArgSignal).toEqual([])
        expect(await stringSignal).toEqual([UPDATED.SignalString])
        expect(await multiArgSignal).toEqual([UPDATED.SignalString, UPDATED.SignalCount])
    })
})

describe("auto-emitting data property", () => {
    it("set is applied locally and round trips", async () => {
        const autoNotify = expectSignal(proxy, "notify::property-auto")
        proxy.PropertyAuto = UPDATED.PropertyAuto
        expect(proxy.PropertyAuto).toBe(UPDATED.PropertyAuto)

        const [pspec] = await autoNotify
        expect((pspec as GObject.ParamSpec).name).toBe("property-auto")
        expect(proxy.PropertyAuto).toBe(UPDATED.PropertyAuto)
    })

    it("setting the same value does not emit PropertiesChanged", async () => {
        let notifies = 0
        const id = proxy.connect("notify::property-auto", () => notifies++)
        proxy.PropertyAuto = UPDATED.PropertyAuto
        await proxy.Echo("barrier") // round trip so the service processed the Set call
        await sleep(200)
        proxy.disconnect(id)
        expect(notifies).toBe(0)
    })

    it("server-initiated changes are propagated", async () => {
        const pokeNotify = expectSignal(proxy, "notify::property-auto")
        await proxy.Poke(UPDATED.Poked)
        await pokeNotify
        expect(proxy.PropertyAuto).toBe(UPDATED.Poked)
    })
})

describe("getter/setter property", () => {
    it("round trips", async () => {
        const notify = expectSignal(proxy, "notify::property")
        proxy.Property = UPDATED.Property
        await notify
        expect(proxy.Property).toBe(UPDATED.Property)
    })
})

describe("read-only property", () => {
    it("server-side updates through the emitter are propagated", async () => {
        const bound = bind(proxy, "read-only-property")
        expect(bound()).toBe(INITIAL.ReadOnlyProperty)

        const notify = expectSignal(proxy, "notify::read-only-property")
        await proxy.SetReadOnly(UPDATED.ReadOnlyProperty)
        await notify
        expect(proxy.ReadOnlyProperty).toBe(UPDATED.ReadOnlyProperty)
        expect(bound()).toBe(UPDATED.ReadOnlyProperty)
    })
})

describe("write-only property", () => {
    it("the value reaches the service", async () => {
        proxy.WriteOnlyProperty = UPDATED.WriteOnlyProperty
        expect(await proxy.GetWriteOnly()).toEqual([UPDATED.WriteOnlyProperty])
    })
})

describe("container properties", () => {
    it("string arrays round trip", async () => {
        const notify = expectSignal(proxy, "notify::array-prop")
        proxy.ArrayProp = UPDATED.ArrayProp
        await notify
        expect(proxy.ArrayProp).toEqual(UPDATED.ArrayProp)
    })

    it("dicts round trip", async () => {
        const notify = expectSignal(proxy, "notify::dict-prop")
        proxy.DictProp = UPDATED.DictProp
        await notify
        expect(proxy.DictProp).toEqual(UPDATED.DictProp)
    })
})

afterAll(() => proxy.Quit())
await run()
