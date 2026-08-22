import GLib from "gi://GLib?version=2.0"
import { createDBusInterface, method, property, signal } from "../index.js"

export const loop = GLib.MainLoop.new(null, false)

export const ComExampleInterface = createDBusInterface("com.example.Interface", {
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
