import { afterAll, beforeAll, describe, expect, it } from "@gnim-js/assert"
import GObject from "gi://GObject?version=2.0"
import { type Annotations, property, register, signal } from "../../lib/gobject/index.js"

// what `import.meta.GNIM_DISABLE_GLOBAL_OVERRIDES` leaves out
const overridden = [Array, Map, Date, Set, Function, Error, Uint8Array, Promise] as Array<{
    $gtype?: GObject.GType
}>

function declareClass() {
    @register
    class WithoutOverrides extends GObject.Object {
        declare readonly $signals: GObject.Object.SignalSignatures &
            Annotations<WithoutOverrides, "objects">

        @property(Array) declare list: number[]
        @property(Map) declare map: Map<string, number>
        @property(Date) declare date: Date
        @property(Set) declare numbers: Set<number>
        @property(Function) declare callback: () => void
        @property(Error) declare error: Error
        @property(Uint8Array) declare bytes: Uint8Array
        @property(Promise) declare promise: Promise<number>

        @signal([Array, Map, Date], GObject.VoidType)
        objects(_list: number[], _map: Map<string, number>, _date: Date): void {}
    }

    return WithoutOverrides
}

describe("without global overrides", () => {
    const gtypes = overridden.map((ctor) => ctor.$gtype)
    let WithoutOverrides: ReturnType<typeof declareClass>

    beforeAll(() => {
        for (const ctor of overridden) delete ctor.$gtype
        WithoutOverrides = declareClass()
    })

    afterAll(() => {
        overridden.forEach((ctor, i) => (ctor.$gtype = gtypes[i]))
    })

    it("stores JS objects in properties", () => {
        const object = new WithoutOverrides()
        const values = {
            list: [1, 2],
            map: new Map([["a", 1]]),
            date: new Date(0),
            numbers: new Set([1]),
            callback: () => {},
            error: new Error("failed"),
            bytes: new Uint8Array([1, 2]),
            promise: Promise.resolve(1),
        }
        Object.assign(object, values)

        for (const [key, value] of Object.entries(values)) {
            expect(object[key as keyof typeof values]).toBe(value)
        }
    })

    it("passes JS objects to signal handlers", () => {
        const object = new WithoutOverrides()
        const values: [number[], Map<string, number>, Date] = [
            [1],
            new Map([["a", 1]]),
            new Date(0),
        ]
        let received: unknown[] = []
        object.connect("objects", (_, ...args) => (received = args))
        object.objects(...values)
        expect(received).toEqual([...values])
    })
})
