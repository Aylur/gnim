import System from "system"
import type { InferEmitter, InferImplementation } from "../index.js"
import { assert, assertEq, assertThrows, report, sleep } from "./assert.js"
import { ComExampleInterface, INITIAL, loop, UPDATED } from "./interface.js"

type Emitter = InferEmitter<typeof ComExampleInterface>

// records of client-driven interactions, verified when the client calls Quit
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
        // let the method return before verifying and quitting
        setTimeout(() => {
            verifyClientPhase()
            loop.quit()
        }, 200)
    }
}

const service = await ComExampleInterface.serve({
    implementation: (em) => new Implementation(em),
})

// access flags are enforced on the service object itself
assertThrows(() => void service.WriteOnlyProperty, "server: reading a write-only property throws")
assertThrows(() => {
    // @ts-expect-error read-only property
    service.ReadOnlyProperty = 0
}, "server: writing a read-only property throws")

// setting a data property notifies (and auto-emits PropertiesChanged on the bus)
let autoNotifies = 0
const autoId = service.connect("notify::property-auto", () => autoNotifies++)
service.PropertyAuto = "local-change"
assertEq(service.PropertyAuto, "local-change", "server: local data property set is applied")
assertEq(autoNotifies, 1, "server: local data property set emits notify::")
service.PropertyAuto = "local-change"
assertEq(autoNotifies, 1, "server: setting the same value does not notify")
service.PropertyAuto = INITIAL.PropertyAuto
assertEq(autoNotifies, 2, "server: resetting to a different value notifies again")
service.disconnect(autoId)

// getter/setter properties notify through the emitter called in the setter
let propNotifies = 0
const propId = service.connect("notify::property", () => propNotifies++)
service.Property = "local-change"
assertEq(service.Property, "local-change", "server: accessor setter was invoked")
assertEq(propNotifies, 1, "server: emitter.Property() emits notify::")
service.Property = INITIAL.Property
service.disconnect(propId)

// read-only properties are updated internally and notified with the emitter
let roNotifies = 0
const roId = service.connect("notify::read-only-property", () => roNotifies++)
service.SetReadOnly(11)
assertEq(service.ReadOnlyProperty, 11, "server: read-only property updated internally")
assertEq(roNotifies, 1, "server: emitter.ReadOnlyProperty() emits notify::")
service.SetReadOnly(INITIAL.ReadOnlyProperty)
service.disconnect(roId)

// methods can be invoked directly on the service object
assertEq(service.Echo("local"), ["local"], "server: direct sync method call")
assertEq(await service.AsyncEcho("local"), ["local"], "server: direct async method call")

// emitter signals are also emitted as gobject signals, synchronously
const receivedSignals: unknown[][] = []
const sigId = service.connect("multi-arg-signal", (_s: unknown, msg: string, count: number) => {
    receivedSignals.push([msg, count])
})
service.implementation.emitter.MultiArgSignal("local", 1)
assertEq(receivedSignals, [["local", 1]], "server: emitter emits the gobject signal")
service.disconnect(sigId)

// reset the records the self tests produced, then track the client-driven phase
invoked.length = 0
service.connect("notify::property-auto", () => seenAutoNotifies.push(service.PropertyAuto))
service.connect("notify::property", () => seenPropertyNotifies.push(service.Property))
service.connect("notify::read-only-property", () => {
    seenReadOnlyNotifies.push(service.ReadOnlyProperty)
})
service.connect("string-signal", (_s: unknown, value: string) => seenStringSignals.push(value))
service.connect("multi-arg-signal", (_s: unknown, msg: string, count: number) => {
    seenMultiArgSignals.push([msg, count])
})
service.connect("no-arg-signal", () => seenNoArgSignals++)

function verifyClientPhase() {
    // gobject notify:: signals emitted while serving the client
    assertEq(
        seenAutoNotifies,
        [UPDATED.PropertyAuto, UPDATED.Poked],
        "server: notify:: fired once per remote PropertyAuto change",
    )
    assertEq(
        seenPropertyNotifies,
        [UPDATED.Property],
        "server: notify:: fired for the accessor property",
    )
    assertEq(
        seenReadOnlyNotifies,
        [UPDATED.ReadOnlyProperty],
        "server: notify:: fired for the read-only property",
    )

    // gobject signals emitted while serving the client
    assertEq(seenNoArgSignals, 1, "server: NoArgSignal emitted as a gobject signal")
    assertEq(
        seenStringSignals,
        [UPDATED.SignalString],
        "server: StringSignal emitted as a gobject signal",
    )
    assertEq(
        seenMultiArgSignals,
        [[UPDATED.SignalString, UPDATED.SignalCount]],
        "server: MultiArgSignal emitted as a gobject signal",
    )

    // final state written by the client
    assertEq(service.PropertyAuto, UPDATED.Poked, "server: final PropertyAuto")
    assertEq(service.Property, UPDATED.Property, "server: accessor setter received the value")
    assertEq(service.ReadOnlyProperty, UPDATED.ReadOnlyProperty, "server: final ReadOnlyProperty")
    assertEq(
        service.GetWriteOnly(),
        [UPDATED.WriteOnlyProperty],
        "server: write-only setter received the client value",
    )
    assertEq(service.ArrayProp, UPDATED.ArrayProp, "server: final ArrayProp")
    assertEq(service.DictProp, UPDATED.DictProp, "server: final DictProp")

    // every method was invoked by the client
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
        assert(invoked.includes(name), `server: ${name} was invoked by the client`)
    }
}

await loop.runAsync()

const failed = report("service")
service.unexport()
System.exit(failed > 0 ? 1 : 0)
