import { afterAll, beforeAll, describe, expect, it, run } from "@gnim-js/assert"
import GLib from "gi://GLib?version=2.0"
import { bind } from "../../jsx/store.js"
import type { InferEmitter, InferImplementation } from "../index.js"
import { ComExampleInterface, INITIAL, sleep, UPDATED } from "./interface.js"

const loop = GLib.MainLoop.new(null, false)
type Emitter = InferEmitter<typeof ComExampleInterface>

const invoked: string[] = []
const seenAutoNotifies: string[] = []
const seenPropertyNotifies: string[] = []
const seenReadOnlyNotifies: number[] = []
const seenStringSignals: string[] = []
const seenMultiArgSignals: [string, number][] = []
let seenNoArgSignals = 0

class Implementation implements InferImplementation<typeof ComExampleInterface> {
    emitter: Emitter

    private propertyValue = INITIAL.Property
    private readOnlyValue = INITIAL.ReadOnlyProperty
    private writeOnlyValue = 0

    constructor(emitter: Emitter) {
        this.emitter = emitter
    }

    // rw data properties: assignments auto-emit PropertiesChanged and notify::
    PropertyAuto = INITIAL.PropertyAuto
    ArrayProp = [...INITIAL.ArrayProp]
    DictProp = { ...INITIAL.DictProp }

    // rw getter/setter property: has to emit manually through the emitter
    get Property() {
        return this.propertyValue
    }
    set Property(value: string) {
        invoked.push(`set Property ${value}`)
        this.propertyValue = value
        this.emitter.Property()
    }

    // read-only property backed by a getter,
    // updated internally through SetReadOnly below
    get ReadOnlyProperty() {
        return this.readOnlyValue
    }

    // write-only property backed by a setter
    set WriteOnlyProperty(value: number) {
        invoked.push(`set WriteOnlyProperty ${value}`)
        this.writeOnlyValue = value
    }

    /* methods with sync and async implementations */
    NoArgsNoReturn() {
        invoked.push("NoArgsNoReturn")
    }
    async AsyncNoReturn() {
        await sleep(2)
        invoked.push("AsyncNoReturn")
    }
    Echo(value: string): [string] {
        invoked.push("Echo")
        return [value]
    }
    async AsyncEcho(value: string): Promise<[string]> {
        await sleep(2)
        invoked.push("AsyncEcho")
        return [value]
    }
    Concat(parts: string[], separator: string): [string] {
        invoked.push("Concat")
        return [parts.join(separator)]
    }
    SyncFail(): void {
        invoked.push("SyncFail")
        throw Error("sync failure")
    }
    async AsyncFail(): Promise<void> {
        await sleep(2)
        invoked.push("AsyncFail")
        throw Error("async failure")
    }
    CustomFail(): void {
        invoked.push("CustomFail")
        const error = Error("custom failure")
        error.name = "com.example.Interface.Error.Custom"
        throw error
    }

    /* orchestration for the client script */
    EmitSignals(msg: string, count: number) {
        invoked.push("EmitSignals")
        this.emitter.NoArgSignal()
        this.emitter.StringSignal(msg)
        this.emitter.MultiArgSignal(msg, count)
    }
    SetReadOnly(value: number) {
        invoked.push("SetReadOnly")
        this.readOnlyValue = value
        this.emitter.ReadOnlyProperty()
    }
    GetWriteOnly(): [number] {
        invoked.push("GetWriteOnly")
        return [this.writeOnlyValue]
    }
    Poke(value: string) {
        invoked.push("Poke")
        // assignments on the service object behave like local assignments:
        // data properties auto-emit PropertiesChanged
        service.PropertyAuto = value
    }
    Quit() {
        invoked.push("Quit")
        // let the method return before quitting
        setTimeout(() => loop.quit(), 200)
    }
}

const service = await ComExampleInterface.serve({
    implementation: (em) => new Implementation(em),
})

afterAll(() => service.unexport())

describe("service object", () => {
    it("enforces access flags", () => {
        expect(() => void service.WriteOnlyProperty).toThrow()
        expect(() => {
            // @ts-expect-error read-only property
            service.ReadOnlyProperty = 0
        }).toThrow()
    })

    it("data properties notify when they change", () => {
        let notifies = 0
        const id = service.connect("notify::property-auto", () => notifies++)
        service.PropertyAuto = "local-change"
        expect(service.PropertyAuto).toBe("local-change")
        expect(notifies).toBe(1)

        service.PropertyAuto = "local-change"
        expect(notifies).toBe(1)

        service.PropertyAuto = INITIAL.PropertyAuto
        expect(notifies).toBe(2)
        service.disconnect(id)
    })

    it("bind with a kebab-case name", () => {
        const bound = bind(service, "property-auto")
        expect(bound()).toBe(INITIAL.PropertyAuto)
        service.PropertyAuto = "bound-change"
        expect(bound()).toBe("bound-change")
        service.PropertyAuto = INITIAL.PropertyAuto
    })

    it("getter/setter properties notify through the emitter", () => {
        let notifies = 0
        const id = service.connect("notify::property", () => notifies++)
        service.Property = "local-change"
        expect(service.Property).toBe("local-change")
        expect(notifies).toBe(1)
        service.Property = INITIAL.Property
        service.disconnect(id)
    })

    it("read-only properties are updated internally and notified with the emitter", () => {
        let notifies = 0
        const id = service.connect("notify::read-only-property", () => notifies++)
        service.SetReadOnly(11)
        expect(service.ReadOnlyProperty).toBe(11)
        expect(notifies).toBe(1)
        service.SetReadOnly(INITIAL.ReadOnlyProperty)
        service.disconnect(id)
    })

    it("methods can be invoked directly", async () => {
        expect(service.Echo("local")).toEqual(["local"])
        expect(await service.AsyncEcho("local")).toEqual(["local"])
    })

    it("emitter signals are emitted as gobject signals synchronously", () => {
        const received: unknown[][] = []
        const id = service.connect("multi-arg-signal", (_s: unknown, msg: string, count: number) =>
            received.push([msg, count]),
        )
        service.implementation.emitter.MultiArgSignal("local", 1)
        service.disconnect(id)
        expect(received).toEqual([["local", 1]])
    })
})

describe("client phase", () => {
    // tracks what happens while serving the client script, until it calls Quit
    beforeAll(async () => {
        invoked.length = 0
        service.connect("notify::property-auto", () => seenAutoNotifies.push(service.PropertyAuto))
        service.connect("notify::property", () => seenPropertyNotifies.push(service.Property))
        service.connect("notify::read-only-property", () => {
            seenReadOnlyNotifies.push(service.ReadOnlyProperty)
        })
        service.connect("string-signal", (_s: unknown, value: string) => {
            seenStringSignals.push(value)
        })
        service.connect("multi-arg-signal", (_s: unknown, msg: string, count: number) => {
            seenMultiArgSignals.push([msg, count])
        })
        service.connect("no-arg-signal", () => seenNoArgSignals++)

        await loop.runAsync()
    })

    it("notify:: fired for remote property changes", () => {
        expect(seenAutoNotifies).toEqual([UPDATED.PropertyAuto, UPDATED.Poked])
        expect(seenPropertyNotifies).toEqual([UPDATED.Property])
        expect(seenReadOnlyNotifies).toEqual([UPDATED.ReadOnlyProperty])
    })

    it("signals were emitted as gobject signals", () => {
        expect(seenNoArgSignals).toBe(1)
        expect(seenStringSignals).toEqual([UPDATED.SignalString])
        expect(seenMultiArgSignals).toEqual([[UPDATED.SignalString, UPDATED.SignalCount]])
    })

    it("received the state written by the client", () => {
        expect(service.PropertyAuto).toBe(UPDATED.Poked)
        expect(service.Property).toBe(UPDATED.Property)
        expect(service.ReadOnlyProperty).toBe(UPDATED.ReadOnlyProperty)
        expect(service.GetWriteOnly()).toEqual([UPDATED.WriteOnlyProperty])
        expect(service.ArrayProp).toEqual(UPDATED.ArrayProp)
        expect(service.DictProp).toEqual(UPDATED.DictProp)
    })

    it("every method was invoked by the client", () => {
        for (const name of [
            "NoArgsNoReturn",
            "AsyncNoReturn",
            "Echo",
            "AsyncEcho",
            "Concat",
            "SyncFail",
            "AsyncFail",
            "CustomFail",
            "EmitSignals",
            "SetReadOnly",
            "GetWriteOnly",
            "Poke",
            "Quit",
        ]) {
            expect(invoked).toContain(name)
        }
    })
})

await run()
