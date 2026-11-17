import { describe, expect, it } from "@gnim-js/assert"
import Gio from "gi://Gio?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { type Annotations, gtype, property, register, signal } from "../../lib/gobject/index.js"

function pspecOf<T extends GObject.Object>(
    klass: abstract new (...args: never[]) => T,
    name: Extract<keyof (T["$readableProperties"] & T["$writableProperties"]), string>,
): GObject.ParamSpec {
    return GObject.Object.find_property.call(klass, name) as GObject.ParamSpec
}

function signalOf<T extends GObject.Object>(
    klass: (abstract new (...args: never[]) => T) & { $gtype: GObject.GType },
    name: Extract<keyof T["$signals"], string>,
): GObject.SignalQuery {
    return GObject.signal_query(GObject.signal_lookup(name, klass.$gtype))!
}

function notifications<T extends GObject.Object>(
    object: T,
    name: Extract<keyof T["$readableProperties"], string>,
): string[] {
    const seen: string[] = []
    GObject.signal_connect(object, `notify::${name}`, (_, pspec) => {
        seen.push((pspec as GObject.ParamSpec).name)
    })
    return seen
}

@register
class Mini extends GObject.Object {}

type RwProperties =
    | "myString"
    | "myNumber"
    | "myBoolean"
    | "object"
    | "nullableObject"
    | "unionObject"
    | "snake_case"
    | "initialized"
    | "readwrite"
    | "unsigned"
    | "fromFactory"
    | "fromSpec"
    | "list"
    | "map"
    | "date"
    | "numbers"
    | "error"
    | "bytes"
    | "promise"
    | "pair"

type Signals =
    | "withArgs"
    | "withObject"
    | "withUnionObject"
    | "snake_signal"
    | "noDefault"
    | "declared"
    | "objects"
    | "compute"
    | "runLast"

const factoryCalls: Array<[string, GObject.ParamFlags]> = []
const defaultCalls: string[] = []

@register({ GTypeName: "GnimTestKlass", Implements: [Gio.ListModel] })
class Klass extends GObject.Object implements Gio.ListModel.Interface {
    declare readonly $readableProperties: Gio.ListModel.ReadableProperties &
        Annotations<Klass, RwProperties | "readonly">

    declare readonly $writableProperties: Gio.ListModel.WritableProperties &
        Annotations<Klass, RwProperties | "writeonly">

    declare readonly $signals: Gio.ListModel.SignalSignatures & Annotations<Klass, Signals>

    @property declare myString: string
    @property declare myNumber: number
    @property declare myBoolean: boolean
    @property declare object: Mini

    @property(Mini) declare nullableObject: Mini | null
    @property declare unionObject: Mini | null

    @property declare snake_case: string

    @property initialized: string = "initial"

    // added by @property
    declare get_my_string: () => string

    #value = 0

    @property
    get readonly(): number {
        return 1
    }

    @property
    set writeonly(_: number) {}

    @property
    get readwrite(): number {
        return this.#value
    }

    set readwrite(value: number) {
        if (this.#value !== value) {
            this.#value = value
            this.notify("readwrite")
        }
    }

    @property(GObject.UInt) declare unsigned: number

    @property((name, flags) => {
        factoryCalls.push([name, flags])
        return GObject.ParamSpec.int(name, null, null, flags, 0, 10, 5)
    })
    declare fromFactory: number

    @property(
        GObject.ParamSpec.string("from-spec", null, null, GObject.ParamFlags.READWRITE, "spec"),
    )
    declare fromSpec: string

    @property(Array) declare list: number[]
    @property(Map) declare map: Map<string, number>
    @property(Date) declare date: Date
    @property(Set) declare numbers: Set<number>
    @property(Error) declare error: Error
    @property(Uint8Array) declare bytes: Uint8Array
    @property(Promise) declare promise: Promise<number>
    @property(gtype<[number, number]>(Array)) declare pair: [number, number]

    @signal
    withArgs(text: string, count: number): void {
        defaultCalls.push(`with-args ${text} ${count}`)
    }

    @signal([Mini], GObject.VoidType)
    withObject(_object: Mini | null): void {}

    @signal
    withUnionObject(_object: Mini | null): void {}

    @signal
    snake_signal(text: string): void {
        defaultCalls.push(`snake-signal ${text}`)
    }

    @signal({ default: false })
    noDefault(): void {
        defaultCalls.push("no-default")
    }

    @signal([GObject.UInt], GObject.VoidType)
    declared(_value: number): void {}

    @signal([Array, Map, Date, Error], GObject.VoidType)
    objects(_list: number[], _map: Map<string, number>, _date: Date, _error: Error): void {}

    @signal([], GObject.Int, { default: false })
    compute(): number {
        return 0
    }

    @signal({ flags: GObject.SignalFlags.RUN_LAST })
    runLast(): void {
        defaultCalls.push("run-last default")
    }

    #items: Mini[] = []

    add(item: Mini) {
        this.#items.push(item)
        Gio.ListModel.prototype.items_changed.call(this, this.#items.length - 1, 0, 1)
    }

    vfunc_get_item_type(): GObject.GType {
        return Mini.$gtype
    }

    vfunc_get_n_items(): number {
        return this.#items.length
    }

    vfunc_get_item(position: number): Mini | null {
        return this.#items[position] ?? null
    }

    constructor(props: Partial<GObject.ConstructorProps<Klass>> = {}) {
        super(props)
    }
}

describe("register", () => {
    it("registers a class without options", () => {
        expect(GObject.type_is_a(Mini, GObject.Object)).toBe(true)
        expect(new Mini()).toBeInstanceOf(GObject.Object)
    })

    it("passes options to registerClass", () => {
        expect(Klass.$gtype.name).toBe("GnimTestKlass")
        expect(GObject.type_is_a(Klass, Gio.ListModel)).toBe(true)
    })

    it("implements interfaces", () => {
        const klass = new Klass()
        const changes: number[][] = []
        klass.connect("items-changed", (_, ...args) => changes.push(args))

        const item = new Mini()
        klass.add(item)

        expect(klass.vfunc_get_item_type()).toBe(Mini.$gtype)
        expect(klass.vfunc_get_n_items()).toBe(1)
        expect(klass.vfunc_get_item(0)).toBe(item)
        expect(changes).toEqual([[0, 0, 1]])
    })
})

describe("property on fields", () => {
    it("registers the property with a kebab-case name", () => {
        expect(pspecOf(Klass, "my-string").value_type).toBe(GObject.TYPE_STRING)
    })

    it("infers the type from the annotation", () => {
        expect(pspecOf(Klass, "my-number").value_type).toBe(GObject.TYPE_DOUBLE)
        expect(pspecOf(Klass, "my-boolean").value_type).toBe(GObject.TYPE_BOOLEAN)
        expect(pspecOf(Klass, "object").value_type).toBe(Mini.$gtype)
    })

    it("infers JSObject from a union annotation", () => {
        const object = new Mini()
        const klass = new Klass({ unionObject: object })
        expect(pspecOf(Klass, "union-object").value_type).toBe(GObject.TYPE_JSOBJECT)
        expect(klass.unionObject).toBe(object)
    })

    it("accepts a declared object type for a nullable field", () => {
        expect(pspecOf(Klass, "nullable-object").value_type).toBe(Mini.$gtype)
    })

    it("is readable and writable", () => {
        const { flags } = pspecOf(Klass, "my-string")
        expect(flags & GObject.ParamFlags.READWRITE).toBe(GObject.ParamFlags.READWRITE)
    })

    it("defaults declared fields to the default value of the type", () => {
        const klass = new Klass()
        expect(klass.myString).toBe("")
        expect(klass.myNumber).toBe(0)
        expect(klass.myBoolean).toBe(false)
    })

    it("defaults declared object fields to null", () => {
        const klass = new Klass()
        expect(klass.object).toBeNull()
        expect(klass.nullableObject).toBeNull()
    })

    it("uses the field initializer", () => {
        expect(new Klass().initialized).toBe("initial")
    })

    it("takes declared fields from constructor props", () => {
        const object = new Mini()
        const klass = new Klass({ myString: "hello", myNumber: 2, object })
        expect(klass.myString).toBe("hello")
        expect(klass.myNumber).toBe(2)
        expect(klass.object).toBe(object)
    })

    it("can set a nullable object field back to null", () => {
        const klass = new Klass({ nullableObject: new Mini() })
        klass.nullableObject = null
        expect(klass.nullableObject).toBeNull()
    })

    it("notifies once per change", () => {
        const klass = new Klass()
        const seen = notifications(klass, "my-string")
        klass.myString = "a"
        klass.myString = "a"
        klass.myString = "b"
        expect(seen).toEqual(["my-string", "my-string"])
    })

    it("adds a getter method", () => {
        const klass = new Klass({ myString: "hello" })
        expect(klass.get_my_string()).toBe("hello")
    })

    it("can be bound with bind_property", () => {
        const source = new Klass()
        const target = new Klass()
        source.bind_property("my-string", target, "my-string", GObject.BindingFlags.DEFAULT)
        source.myString = "bound"
        expect(target.myString).toBe("bound")
    })
})

describe("property on accessors", () => {
    it("derives the flags from the accessors", () => {
        const { READABLE, WRITABLE, READWRITE } = GObject.ParamFlags
        expect(pspecOf(Klass, "readonly").flags & READWRITE).toBe(READABLE)
        expect(pspecOf(Klass, "writeonly").flags & READWRITE).toBe(WRITABLE)
        expect(pspecOf(Klass, "readwrite").flags & READWRITE).toBe(READWRITE)
    })

    it("uses the accessors", () => {
        const klass = new Klass()
        const seen = notifications(klass, "readwrite")
        klass.readwrite = 3
        expect(klass.readwrite).toBe(3)
        expect(klass.readonly).toBe(1)
        expect(seen).toEqual(["readwrite"])
    })
})

describe("property type declaration", () => {
    it("accepts a GType", () => {
        expect(pspecOf(Klass, "unsigned").value_type).toBe(GObject.TYPE_UINT)
    })

    it("calls a factory with the kebab-case name and the flags", () => {
        expect(factoryCalls).toEqual([["from-factory", GObject.ParamFlags.READWRITE]])
        expect(new Klass().fromFactory).toBe(5)
    })

    it("accepts a ParamSpec", () => {
        expect(pspecOf(Klass, "from-spec").value_type).toBe(GObject.TYPE_STRING)
        expect(new Klass().fromSpec).toBe("spec")
    })

    it("stores JS objects as they are", () => {
        const klass = new Klass()
        const values = {
            list: [1, 2],
            map: new Map([["a", 1]]),
            date: new Date(0),
            numbers: new Set([1]),
            error: new Error("failed"),
            bytes: new Uint8Array([1, 2]),
            promise: Promise.resolve(1),
            pair: [1, 2] as [number, number],
        }
        Object.assign(klass, values)

        for (const [key, value] of Object.entries(values)) {
            const name = key as keyof typeof values
            expect(pspecOf(Klass, name).value_type).toBe(GObject.TYPE_JSOBJECT)
            expect(klass[name]).toBe(value)
        }
    })
})

describe("signal", () => {
    it("emits the signal with a kebab-case name", () => {
        const klass = new Klass()
        const received: unknown[][] = []
        klass.connect("with-args", (_, text, count) => {
            received.push([text, count])
        })
        klass.withArgs("hello", 2)
        expect(received).toEqual([["hello", 2]])
    })

    it("infers the parameter types from the annotations", () => {
        expect(signalOf(Klass, "with-args").param_types).toEqual([
            GObject.TYPE_STRING,
            GObject.TYPE_DOUBLE,
        ])
        expect(signalOf(Klass, "with-args").return_type).toBe(GObject.TYPE_NONE)
    })

    it("infers JSObject from a union parameter", () => {
        expect(signalOf(Klass, "with-union-object").param_types).toEqual([GObject.TYPE_JSOBJECT])
    })

    it("accepts a declared object type for a nullable parameter", () => {
        expect(signalOf(Klass, "with-object").param_types).toEqual([Mini.$gtype])
    })

    it("passes objects and null to handlers", () => {
        const klass = new Klass()
        const object = new Mini()
        const received: Array<Mini | null> = []
        klass.connect("with-object", (_, value) => received.push(value))
        klass.withObject(object)
        klass.withObject(null)
        expect(received).toEqual([object, null])
    })

    it("accepts declared types", () => {
        expect(signalOf(Klass, "declared").param_types).toEqual([GObject.TYPE_UINT])
    })

    it("runs the method as the default handler", () => {
        defaultCalls.length = 0
        new Klass().emit("with-args", "emitted", 1)
        expect(defaultCalls).toEqual(["with-args emitted 1"])
    })

    it("skips the default handler with default: false", () => {
        defaultCalls.length = 0
        new Klass().noDefault()
        expect(defaultCalls).toEqual([])
    })

    it("passes JS objects to handlers", () => {
        const klass = new Klass()
        const values: [number[], Map<string, number>, Date, Error] = [
            [1],
            new Map([["a", 1]]),
            new Date(0),
            new Error("failed"),
        ]
        let received: unknown[] = []
        klass.connect("objects", (_, ...args) => (received = args))
        klass.objects(...values)
        expect(received).toEqual([...values])
    })

    it("returns the value of the handler", () => {
        const klass = new Klass()
        klass.connect("compute", () => 42)
        expect(klass.compute()).toBe(42)
    })

    it("passes flags to the signal", () => {
        defaultCalls.length = 0
        const klass = new Klass()
        klass.connect("run-last", () => defaultCalls.push("run-last handler"))
        klass.runLast()
        expect(defaultCalls).toEqual(["run-last handler", "run-last default"])
    })
})

describe("snake_case names", () => {
    it("registers the property with a kebab-case name", () => {
        expect(pspecOf(Klass, "snake-case").value_type).toBe(GObject.TYPE_STRING)
    })

    it("notifies with the kebab-case name", () => {
        const klass = new Klass()
        const seen = notifications(klass, "snake-case")
        klass.snake_case = "a"
        expect(seen).toEqual(["snake-case"])
    })

    it("takes the property from constructor props", () => {
        expect(new Klass({ snakeCase: "given" }).snake_case).toBe("given")
    })

    it("reads and writes the property through GObject", () => {
        const source = new Klass()
        const target = new Klass()
        source.bind_property("snake-case", target, "snake-case", GObject.BindingFlags.DEFAULT)
        source.snake_case = "bound"
        expect(target.snake_case).toBe("bound")
    })

    it("emits the signal with a kebab-case name", () => {
        defaultCalls.length = 0
        const klass = new Klass()
        const received: string[] = []
        klass.connect("snake-signal", (_, text) => received.push(text))
        klass.snake_signal("a")
        expect(received).toEqual(["a"])
        expect(defaultCalls).toEqual(["snake-signal a"])
    })
})
