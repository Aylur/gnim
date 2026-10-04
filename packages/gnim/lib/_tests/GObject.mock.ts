type SignalHandler = {
    name: string
    callback: (...args: any[]) => any
}

const registry = new WeakMap<object, Map<number, SignalHandler>>()

let nextId = 1

function signal_connect(instance: object, name: string, callback: (...args: any[]) => any): number {
    const id = nextId++
    const handlers = registry.get(instance) ?? new Map()
    handlers.set(id, { name, callback })
    registry.set(instance, handlers)
    return id
}

function signal_handler_disconnect(instance: object, id: number): void {
    registry.get(instance)?.delete(id)
}

function signal_emit_by_name(instance: object, name: string, ...args: any[]): void {
    const handlers = Array.from(registry.get(instance)?.values() ?? [])

    for (const handler of handlers) {
        if (handler.name === name) {
            handler.callback(instance, ...args)
        }
    }
}

type GType = abstract new (...args: any[]) => any

class ParamSpec {
    name: string
    value_type: GType

    constructor(name: string, value_type: GType) {
        this.name = name
        this.value_type = value_type
    }
}

class Object {
    static get $gtype(): GType {
        return this
    }

    static find_property(this: GType, name: string): ParamSpec | null {
        const key = name.replaceAll("_", "-")
        const type = findPropertyType(this, key)
        return type ? new ParamSpec(key, type) : null
    }
}

function findPropertyType(klass: GType | null, name: string): GType | null {
    if (!klass) return null

    const { $properties } = klass as { $properties?: Record<string, GType> }
    return $properties?.[name] ?? findPropertyType(globalThis.Object.getPrototypeOf(klass), name)
}

function type_is_a(type: GType, isA: GType): boolean {
    return type === isA || type.prototype instanceof isA
}

const GObject = {
    Object,
    ParamSpec,
    TYPE_OBJECT: Object as GType,
    type_is_a,
    signal_connect,
    signal_handler_disconnect,
    signal_emit_by_name,
}

export default GObject
