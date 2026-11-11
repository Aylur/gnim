import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import type { Keyof } from "../../util.js"
import { createDBusInterface, method, property, signal } from "../index.js"

const NAME = "com.example.Interface"
const TIMEOUT = 10_000

export const ComExampleInterface = createDBusInterface(NAME, {
    /* properties */
    PropertyAuto: property("s"),
    ArrayProp: property("as"),
    DictProp: property("a{ss}"),
    Property: property("s"),
    ReadOnlyProperty: property("i", "r"),
    WriteOnlyProperty: property("i", "w"),

    /* methods */
    NoArgsNoReturn: method(),
    AsyncNoReturn: method(),
    Echo: method(["s"], ["s"]),
    AsyncEcho: method(["s"], ["s"]),
    Concat: method(
        [
            { type: "as", name: "parts" },
            { type: "s", name: "separator" },
        ],
        ["s"],
    ),
    SyncFail: method(),
    AsyncFail: method(),
    CustomFail: method(),

    /* signals */
    NoArgSignal: signal(),
    StringSignal: signal("s"),
    MultiArgSignal: signal({ type: "s", name: "msg" }, { type: "i", name: "count" }),

    /* orchestration for the test scripts */
    EmitSignals: method("s", "i"),
    SetReadOnly: method("i"),
    GetWriteOnly: method([], ["i"]),
    Poke: method("s"),
    Quit: method(),
})

// initial state served by service.ts, asserted by proxy.ts
export const INITIAL = {
    PropertyAuto: "initial-auto",
    Property: "initial-prop",
    ReadOnlyProperty: 7,
    ArrayProp: ["a", "b"],
    DictProp: { key1: "value1", key2: "value2" },
}

// state the client writes, verified on both sides
export const UPDATED = {
    PropertyAuto: "from-client",
    Poked: "poked",
    Property: "via-accessor",
    ReadOnlyProperty: 99,
    WriteOnlyProperty: 123,
    ArrayProp: ["x", "y", "z"],
    DictProp: { a: "1", b: "2" },
    SignalString: "payload",
    SignalCount: 42,
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

type SignalsOf<O> = O extends {
    $signals: infer S
    $readableProperties: infer P
}
    ? Keyof<Omit<S, "notify::{}">> | `notify::${Keyof<P>}`
    : never

export function expectSignal<O extends GObject.Object, S extends SignalsOf<O>>(
    object: O,
    signal: S,
    timeoutMs = 2000,
): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            object.disconnect(id)
            reject(Error(`timed out waiting for signal "${signal}"`))
        }, timeoutMs)
        const id = GObject.signal_connect(object, signal, (_source, ...args) => {
            clearTimeout(timer)
            object.disconnect(id)
            resolve(args)
        })
    })
}

export function waitForServiceToAppear(): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            Gio.bus_unwatch_name(id)
            reject(Error(`timed out waiting for "${NAME}" to appear on the bus`))
        }, TIMEOUT)

        const id = Gio.bus_watch_name(
            Gio.BusType.SESSION,
            NAME,
            Gio.BusNameWatcherFlags.NONE,
            () => {
                clearTimeout(timer)
                Gio.bus_unwatch_name(id)
                resolve()
            },
            null,
        )
    })
}
