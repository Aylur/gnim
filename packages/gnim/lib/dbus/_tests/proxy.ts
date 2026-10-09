import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import system from "system"
import {
    assert,
    assertEq,
    assertRejects,
    assertThrows,
    expectSignal,
    report,
    sleep,
} from "./assert.js"
import { ComExampleInterface, UPDATED } from "./interface.js"

const proxy = await ComExampleInterface.proxy()

try {
    print("\n-- property access flags --")
    assertThrows(() => void proxy.WriteOnlyProperty, "reading a write-only property throws")
    assertThrows(() => {
        // @ts-expect-error read-only property
        proxy.ReadOnlyProperty = 0
    }, "writing a read-only property throws")

    print("\n-- methods --")
    assertEq(await proxy.NoArgsNoReturn(), [], "sync method with no out args resolves []")
    assertEq(await proxy.AsyncNoReturn(), [], "async method with no out args resolves []")
    assertEq(await proxy.Echo("hello"), ["hello"], "sync method returns its out tuple")
    assertEq(await proxy.AsyncEcho("hello"), ["hello"], "async implementation behaves the same")
    assertEq(await proxy.Concat(["a", "b", "c"], "-"), ["a-b-c"], "method with container in args")

    print("\n-- method errors --")
    const syncError = await assertRejects(proxy.SyncFail(), "throwing sync implementation rejects")
    assert(syncError instanceof GLib.Error, "sync error is a GLib.Error")
    const asyncError = await assertRejects(
        proxy.AsyncFail(),
        "rejecting async implementation rejects",
    )
    assert(asyncError instanceof GLib.Error, "async error is a GLib.Error")
    const customError = await assertRejects(proxy.CustomFail(), "custom dbus error rejects")
    assert(customError instanceof GLib.Error, "custom error is a GLib.Error")

    print("\n-- signals --")
    const noArgSignal = expectSignal(proxy, "no-arg-signal")
    const stringSignal = expectSignal(proxy, "string-signal")
    const multiArgSignal = expectSignal(proxy, "multi-arg-signal")
    await proxy.EmitSignals(UPDATED.SignalString, UPDATED.SignalCount)
    assertEq(await noArgSignal, [], "signal with no args emitted as a gobject signal")
    assertEq(await stringSignal, [UPDATED.SignalString], "signal with a single arg")
    assertEq(
        await multiArgSignal,
        [UPDATED.SignalString, UPDATED.SignalCount],
        "signal with multiple args",
    )

    print("\n-- auto-emitting data property --")
    const autoNotify = expectSignal(proxy, "notify::property-auto")
    proxy.PropertyAuto = UPDATED.PropertyAuto
    assertEq(
        proxy.PropertyAuto,
        UPDATED.PropertyAuto,
        "set is applied to the local cache immediately",
    )
    const [autoPspec] = await autoNotify
    assertEq(
        (autoPspec as GObject.ParamSpec).name,
        "property-auto",
        "notify:: passes the pspec of the changed property",
    )
    assertEq(
        proxy.PropertyAuto,
        UPDATED.PropertyAuto,
        "value after the PropertiesChanged round trip",
    )

    let unchangedNotifies = 0
    const unchangedId = proxy.connect("notify::property-auto", () => unchangedNotifies++)
    proxy.PropertyAuto = UPDATED.PropertyAuto
    await proxy.Echo("barrier") // round trip so the service processed the Set call
    await sleep(200)
    assertEq(unchangedNotifies, 0, "setting the same value does not emit PropertiesChanged")
    proxy.disconnect(unchangedId)

    const pokeNotify = expectSignal(proxy, "notify::property-auto")
    await proxy.Poke(UPDATED.Poked)
    await pokeNotify
    assertEq(proxy.PropertyAuto, UPDATED.Poked, "server-initiated change is propagated")

    print("\n-- getter/setter property --")
    const propNotify = expectSignal(proxy, "notify::property")
    proxy.Property = UPDATED.Property
    await propNotify
    assertEq(proxy.Property, UPDATED.Property, "accessor property round trip")

    print("\n-- read-only property --")
    const readOnlyNotify = expectSignal(proxy, "notify::read-only-property")
    await proxy.SetReadOnly(UPDATED.ReadOnlyProperty)
    await readOnlyNotify
    assertEq(
        proxy.ReadOnlyProperty,
        UPDATED.ReadOnlyProperty,
        "server-side update through the emitter is propagated",
    )

    print("\n-- write-only property --")
    proxy.WriteOnlyProperty = UPDATED.WriteOnlyProperty
    assertEq(
        await proxy.GetWriteOnly(),
        [UPDATED.WriteOnlyProperty],
        "write-only value reached the service",
    )

    print("\n-- container properties --")
    const arrayNotify = expectSignal(proxy, "notify::array-prop")
    proxy.ArrayProp = UPDATED.ArrayProp
    await arrayNotify
    assertEq(proxy.ArrayProp, UPDATED.ArrayProp, "string array property round trip")

    const dictNotify = expectSignal(proxy, "notify::dict-prop")
    proxy.DictProp = UPDATED.DictProp
    await dictNotify
    assertEq(proxy.DictProp, UPDATED.DictProp, "dict property round trip")

    await proxy.Quit()
} catch (error) {
    console.error(error)
    await proxy.Quit().catch(() => null)
    system.exit(1)
}

const failed = report("proxy")
system.exit(failed > 0 ? 1 : 0)
