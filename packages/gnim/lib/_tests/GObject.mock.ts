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

class Object {}
class ParamSpec {}

const GObject = {
    Object,
    ParamSpec,
    signal_connect,
    signal_handler_disconnect,
    signal_emit_by_name,
}

export default GObject
