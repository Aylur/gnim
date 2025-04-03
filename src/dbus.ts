import Gio from "gi://Gio"
import GLib from "gi://GLib"

export { Gio as default }
export const Variant = GLib.Variant
export type Variant = GLib.Variant
export type DBusObject = Gio.DBusExportedObject

const meta = Symbol("dbus interface metadata")
const priv = Symbol("dbus priv properties")
const nodeXml = Symbol("dbus interface xml")

type MethodArg = {
    name?: string
    type: string
    direction: "in" | "out"
}

type SignalArg = {
    name?: string
    type: string
}

type Property = {
    name?: string
    type: string
    access: "read" | "write" | "readwrite"
}

type InterfaceMetadata = {
    name: string
    methods: Record<string, Array<MethodArg>>
    signals: Record<string, Array<SignalArg>>
    properties: Array<Property>
}

type XmlNode = {
    name: string
    attributes?: Record<string, string>
    children?: Array<XmlNode>
}

function xml({ name, attributes, children }: XmlNode) {
    let builder = `<${name}`
    const attrs = Object.entries(attributes ?? [])
    if (attrs.length > 0) {
        for (const [key, value] of attrs) {
            builder += ` ${key}="${value}"`
        }
    }
    if (children && children.length > 0) {
        builder += ">"
        for (const node of children) {
            builder += xml(node)
        }
        builder += `</${name}>`
    } else {
        builder += " />"
    }
    return builder
}

interface InterfaceInstance {
    dbusObject?: DBusObject
    [priv]?: Record<string, unknown>
}

interface InterfaceConstructor {
    [meta]?: InterfaceMetadata
    [nodeXml]?: string

    new (): any
}

export function iface(name: string) {
    return function (cls: InterfaceConstructor) {
        const metadata = cls[meta]
        if (!metadata) throw Error(`${cls} is not an interface`)
        const { methods = {}, signals = {}, properties = [] } = metadata

        metadata.name = name
        cls[nodeXml] = xml({
            name: "node",
            children: [
                {
                    name: "interface",
                    attributes: { name },
                    children: [
                        ...Object.entries(methods).map(([name, args]) => ({
                            name: "method",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...Object.entries(signals).map(([name, args]) => ({
                            name: "signal",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...properties.map((prop) => ({
                            name: "property",
                            attributes: prop,
                        })),
                    ],
                },
            ],
        })
    }
}

export function method(...args: Array<string | MethodArg>) {
    return function (target: any, name: string, _desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}

        const metadata = target.constructor[meta] as InterfaceMetadata
        metadata.methods ??= {}
        metadata.methods[name] = args.map((arg) =>
            typeof arg === "string" ? { type: arg, direction: "in" } : arg,
        )
    }
}

export function signal(...args: Array<string | SignalArg>) {
    return function (target: any, name: string, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}

        const signalArgs = args.map((arg) => (typeof arg === "string" ? { type: arg } : arg))

        const metadata = target.constructor[meta] as InterfaceMetadata
        metadata.signals ??= {}
        metadata.signals[name] = signalArgs

        const signature = `(${signalArgs.map(({ type }) => type).join("")})`

        const emitFn: PropertyDescriptor & ThisType<InterfaceInstance> = {
            value: function (...args: unknown[]) {
                const { dbusObject } = this
                if (dbusObject) {
                    dbusObject.emit_signal(name, new GLib.Variant(signature, args))
                }
            },
        }

        if (!desc) {
            return emitFn as any
        } else {
            const og: (...args: unknown[]) => unknown = desc.value
            desc.value = function (...args: unknown[]) {
                const ret = og.apply(this, args)
                emitFn.value.apply(this, args)
                return ret
            }
        }
    }
}

export function property(type: Property["type"], access: Property["access"] = "readwrite") {
    return function (target: any, name: string, desc?: PropertyDescriptor) {
        target.constructor[meta] ??= {}

        const metadata = target.constructor[meta] as InterfaceMetadata
        metadata.properties ??= []

        if (!desc) {
            const desc: PropertyDescriptor & ThisType<InterfaceInstance> = {
                ...((access === "read" || access === "readwrite") && {
                    get() {
                        return this[priv]?.[name]
                    },
                }),
                ...((access === "write" || access === "readwrite") && {
                    set(v: unknown) {
                        if (v !== this[priv]?.[name]) {
                            this[priv] ??= {}
                            this[priv][name] = v
                            this.dbusObject?.emit_property_changed(name, new GLib.Variant(type, v))
                        }
                    },
                }),
            }

            metadata.properties.push({ name, type, access })
            return desc as any
        } else {
            if (desc.get && desc.set) access = "readwrite"
            if (desc.get && !desc.set) access = "read"
            if (!desc.get && desc.set) access = "write"
            metadata.properties.push({ name, type, access })
        }
    }
}

type ServiceProps = {
    busType: Gio.BusType
    name: string
    path: string
    flags: Gio.BusNameOwnerFlags
    onBusAcquired: (conn: Gio.DBusConnection) => void
    onNameAcquired: (conn: Gio.DBusConnection) => void
    onNameLost: (conn: Gio.DBusConnection) => void
}

export type Service<T> = T & {
    dbusObject: Gio.DBusExportedObject
    unown(): void
}

export function serve<T extends InterfaceConstructor>(
    iface: T,
    props: Partial<ServiceProps> = {},
): Service<InstanceType<T>> {
    const info = iface[nodeXml]
    if (!info) throw Error(`${iface} not an interface`)

    const instance = new iface()
    const dbusObject = Gio.DBusExportedObject.wrapJSObject(info, instance)

    const {
        busType = Gio.BusType.SESSION,
        name = iface[meta]!.name,
        path = "/" + name.split(".").join("/"),
        flags = Gio.BusNameOwnerFlags.NONE,
    } = props

    const id = Gio.bus_own_name(
        busType,
        name,
        flags,
        (conn: Gio.DBusConnection) => {
            dbusObject.export(conn, path)
            props.onNameAcquired?.(conn)
        },
        props.onNameAcquired ?? null,
        props.onNameLost ?? null,
    )

    return Object.assign(instance, {
        dbusObject,
        unown: () => {
            Gio.bus_unown_name(id)
        },
    })
}

export function serveAsync<T extends InterfaceConstructor>(
    iface: T,
    props: Partial<ServiceProps & { timeout: number }> = {},
): Promise<Service<InstanceType<T>>> {
    return new Promise((resolve, reject) => {
        const { timeout = 10_000, ...rest } = props

        const source =
            timeout > 0
                ? setTimeout(() => {
                      reject(Error(`serveAsync timed out`))
                  }, timeout)
                : null

        try {
            const instance = serve(iface, {
                ...rest,
                onNameAcquired: (conn) => {
                    if (source) clearTimeout(source)
                    resolve(instance)
                    rest.onNameAcquired?.(conn)
                },
            })
        } catch (error) {
            reject(error)
        } finally {
            if (source) clearTimeout(source)
        }
    })
}

type ProxyProps = {
    connection: Gio.DBusConnection
    name: string
    path: string
}

type AsyncProxyProps = ProxyProps & {
    flags: Gio.DBusProxyFlags
    timeout: number
}

export type Proxy<T> = T & Gio.DBusProxy

export function proxy<T extends InterfaceConstructor>(
    iface: T,
    props: Partial<ProxyProps> = {},
): Proxy<InstanceType<T>> {
    const info = iface[nodeXml]
    if (!info) throw Error(`${iface} is not an interface`)

    const {
        connection = Gio.DBus.session,
        name = iface[meta]?.name || "",
        path = "/" + name.split(".").join("/"),
    } = props

    const Proxy = Gio.DBusProxy.makeProxyWrapper(info)
    return Proxy(connection, name, path) as Proxy<InstanceType<T>>
}

export function proxyAsync<T extends InterfaceConstructor>(
    iface: T,
    props: Partial<AsyncProxyProps> = {},
): Promise<Proxy<InstanceType<T>>> {
    return new Promise((resolve, reject) => {
        const info = iface[nodeXml]
        if (!info) reject(Error(`${iface} is not an interface`))

        const {
            connection = Gio.DBus.session,
            name = iface[meta]?.name || "",
            path = "/" + name.split(".").join("/"),
            timeout = 10_000,
            flags = Gio.DBusProxyFlags.NONE,
        } = props

        const source =
            timeout > 0
                ? setTimeout(() => {
                      reject(Error(`serveAsync timed out`))
                  }, timeout)
                : null

        const Proxy = Gio.DBusProxy.makeProxyWrapper(info)

        Proxy(
            connection,
            name,
            path,
            (proxy, error) => {
                if (source) clearTimeout(source)
                if (error !== null) reject(error)
                resolve(proxy as Proxy<InstanceType<T>>)
            },
            null,
            flags,
        )
    })
}
