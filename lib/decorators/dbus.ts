/**
 * A {@link Service} currently only allows interfacing with a single interface of a remote object.
 * In the future I want to come up with an API to be able to create Service objects for multiple
 * interfaces of an object at the same time. Example usage would be for example combining
 * "org.mpris.MediaPlayer2" and "org.mpris.MediaPlayer2.Player" into a single object.
 */
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { emit, kebabcase, xml, type DeepInferVariant, type Keyof } from "../util.js"
import {
    property as gproperty,
    signal as gsignal,
    register,
    type RegisterOptions,
} from "./gobject.js"

const DEFAULT_TIMEOUT = 10_000

export const Variant = GLib.Variant
export type Variant<T extends string> = GLib.Variant<T>

const info = Symbol("dbus interface info")
const internals = Symbol("dbus interface internals")
const remoteMethod = Symbol("proxy remoteMethod")
const remoteMethodAsync = Symbol("proxy remoteMethodAsync")
const remotePropertySet = Symbol("proxy remotePropertySet")

export type ProxyProps = {
    bus?: Gio.DBusConnection
    name?: string
    objectPath?: string
    flags?: Gio.DBusProxyFlags
    timeout?: number
}

export type ServeProps = {
    busType?: Gio.BusType
    name?: string
    objectPath?: string
    flags?: Gio.BusNameOwnerFlags
    timeout?: number
}

/**
 * Base type for DBus services and proxies. Interface name is set with
 * the {@link iface} decorator which also register it as a GObject type.
 */
export class Service extends GObject.Object {
    declare static [info]?: Gio.DBusInterfaceInfo
    #info: Gio.DBusInterfaceInfo

    static {
        GObject.registerClass(this)
    }

    [internals]: {
        dbusObject?: Gio.DBusExportedObject
        proxy?: Gio.DBusProxy
        priv: Record<string | symbol, unknown>
        onStop: Set<() => void>
    } = {
        priv: {},
        onStop: new Set<() => void>(),
    }

    constructor() {
        super()
        const service = this.constructor as unknown as typeof Service
        if (!service[info]) throw Error("missing interface info")
        this.#info = service[info]
    }

    notify(propertyName: Extract<keyof this, string> | (string & {})): void {
        const prop = this.#info.lookup_property(propertyName)

        if (prop && this[internals].dbusObject) {
            this[internals].dbusObject.emit_property_changed(
                propertyName,
                new GLib.Variant(prop.signature, this[propertyName as keyof this]),
            )
        }

        super.notify(kebabcase(propertyName))
    }

    emit(name: string, ...params: unknown[]): unknown {
        const signal = this.#info.lookup_signal(name)

        if (signal && this[internals].dbusObject) {
            const signature = `(${signal.args.map((a) => a.signature).join("")})`
            this[internals].dbusObject.emit_signal(name, new GLib.Variant(signature, params))
        }

        return emit(this, kebabcase(name), ...params)
    }

    // server
    #handlePropertyGet(_: Gio.DBusExportedObject, propertyName: string) {
        const prop = this.#info.lookup_property(propertyName)

        if (!prop) {
            throw Error(`${this.constructor.name} has no exported property: "${propertyName}"`)
        }

        const value = this[propertyName as keyof this]
        if (typeof value !== "undefined") {
            return new GLib.Variant(prop.signature, value)
        } else {
            return null
        }
    }

    // server
    #handlePropertySet(_: Gio.DBusExportedObject, propertyName: string, value: GLib.Variant) {
        const prop = this.#info.lookup_property(propertyName)

        if (!prop) {
            throw Error(`${this.constructor.name} has no property: "${propertyName}"`)
        }

        const name = propertyName as keyof this
        const newValue = value.deepUnpack() as this[typeof name]
        if (this[name] !== newValue) {
            this[name] = newValue
        }
    }

    // server
    #returnError(error: unknown, invocation: Gio.DBusMethodInvocation) {
        console.error(error)
        if (error instanceof GLib.Error) {
            return invocation.return_gerror(error)
        }
        if (error instanceof Error) {
            return invocation.return_dbus_error(
                error.name.includes(".") ? error.name : `gjs.JSError.${error.name}`,
                error.message,
            )
        }
        invocation.return_dbus_error("gjs.DBusService.UnknownError", `${error}`)
    }

    // server
    #returnValue(value: unknown, methodName: string, invocation: Gio.DBusMethodInvocation) {
        if (value === null || value === undefined) {
            return invocation.return_value(new GLib.Variant("()", []))
        }

        const args = this.#info.lookup_method(methodName)?.out_args ?? []
        const signature = `(${args.map((arg) => arg.signature).join("")})`
        if (!Array.isArray(value)) throw Error("value has to be a tuple")
        invocation.return_value(new GLib.Variant(signature, value))
    }

    // server
    #handleMethodCall(
        _: Gio.DBusExportedObject,
        methodName: string,
        parameters: GLib.Variant,
        invocation: Gio.DBusMethodInvocation,
    ): void {
        try {
            const name = methodName as Keyof<this>
            const unpacked = parameters.deepUnpack() as Iterable<unknown>
            const method = this[name] as (...args: unknown[]) => unknown
            const value = method.call(this, ...unpacked)

            if (value instanceof GLib.Variant) {
                invocation.return_value(value)
            } else if (value instanceof Promise) {
                value
                    .then((value) => this.#returnValue(value, name, invocation))
                    .catch((error) => this.#returnError(error, invocation))
            } else {
                this.#returnValue(value, name, invocation)
            }
        } catch (error) {
            this.#returnError(error, invocation)
        }
    }

    // server
    async serve({
        busType = Gio.BusType.SESSION,
        name = this.#info.name,
        objectPath = "/" + this.#info.name.split(".").join("/"),
        flags = Gio.BusNameOwnerFlags.NONE,
        timeout = DEFAULT_TIMEOUT,
    }: ServeProps = {}): Promise<this> {
        if (this[internals].dbusObject) return Promise.resolve(this)

        const impl = new Gio.DBusExportedObject({ gInterfaceInfo: this.#info })

        impl.connect("handle-method-call", this.#handleMethodCall.bind(this))
        impl.connect("handle-property-get", this.#handlePropertyGet.bind(this))
        impl.connect("handle-property-set", this.#handlePropertySet.bind(this))

        this.#info.cache_build()

        return new Promise((resolve, reject) => {
            let source =
                timeout > 0
                    ? setTimeout(() => {
                          reject(Error(`serve timed out`))
                          source = null
                      }, timeout)
                    : null

            const clear = () => {
                if (source) {
                    clearTimeout(source)
                    source = null
                }
            }

            const busId = Gio.bus_own_name(
                busType,
                name,
                flags,
                (conn) => {
                    try {
                        impl.export(conn, objectPath)
                        this[internals].dbusObject = impl
                        this[internals].onStop.add(() => {
                            Gio.bus_unown_name(busId)
                            impl.unexport()
                            this.#info.cache_release()
                            delete this[internals].dbusObject
                        })

                        resolve(this)
                    } catch (error) {
                        reject(error)
                    }
                },
                clear,
                clear,
            )
        })
    }

    // proxy
    #handlePropertiesChanged(
        _: Gio.DBusProxy,
        changed: GLib.Variant<"a{sv}">,
        invalidated: string[],
    ) {
        const set = new Set([...Object.keys(changed.deepUnpack()), ...invalidated])
        for (const name of set.values()) {
            super.notify(kebabcase(name))
        }
    }

    // proxy
    #handleSignal(
        _: Gio.DBusProxy,
        _sender: string | null,
        signal: string,
        parameters: GLib.Variant,
    ) {
        const params = parameters.deepUnpack() as Iterable<unknown>
        emit(this, kebabcase(signal), ...params)
    }

    // proxy
    #remoteMethodParams(
        methodName: string,
        args: unknown[],
    ): Parameters<Gio.DBusProxy["call_sync"]> {
        const { proxy } = this[internals]
        if (!proxy) throw Error("invalid remoteMethod invocation: not a proxy")

        const method = this.#info.lookup_method(methodName)
        if (!method) throw Error("method not found")

        const signature = `(${method.in_args.map((a) => a.signature).join("")})`

        return [
            methodName,
            new GLib.Variant(signature, args),
            Gio.DBusCallFlags.NONE,
            DEFAULT_TIMEOUT,
            null,
        ]
    }

    // proxy
    [remoteMethod](methodName: string, args: unknown[]): GLib.Variant {
        const params = this.#remoteMethodParams(methodName, args)
        return this[internals].proxy!.call_sync(...params)
    }

    // proxy
    [remoteMethodAsync](methodName: string, args: unknown[]): Promise<GLib.Variant> {
        return new Promise((resolve, reject) => {
            try {
                const params = this.#remoteMethodParams(methodName, args)
                this[internals].proxy!.call(...params, (_, res) => {
                    try {
                        resolve(this[internals].proxy!.call_finish(res))
                    } catch (error) {
                        reject(error)
                    }
                })
            } catch (error) {
                reject(error)
            }
        })
    }

    // proxy
    [remotePropertySet](name: string, value: unknown) {
        const proxy = this[internals].proxy!
        const prop = this.#info.lookup_property(name)!

        const variant = new GLib.Variant(prop.signature, value)
        proxy.set_cached_property(name, variant)

        proxy.call(
            "org.freedesktop.DBus.Properties.Set",
            new GLib.Variant("(ssv)", [proxy.gInterfaceName, name, variant]),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (_, res) => {
                try {
                    proxy.call_finish(res)
                } catch (e) {
                    console.error(e)
                }
            },
        )
    }

    // proxy
    async proxy({
        bus = Gio.DBus.session,
        name = this.#info.name,
        objectPath = "/" + this.#info.name.split(".").join("/"),
        flags = Gio.DBusProxyFlags.NONE,
        timeout = DEFAULT_TIMEOUT,
    }: ProxyProps = {}): Promise<this> {
        if (this[internals].proxy) return Promise.resolve(this)

        const proxy = new Gio.DBusProxy({
            gConnection: bus,
            gInterfaceName: this.#info.name,
            gInterfaceInfo: this.#info,
            gName: name,
            gFlags: flags,
            gObjectPath: objectPath,
        })

        return new Promise((resolve, reject) => {
            const cancallable = new Gio.Cancellable()

            let source =
                timeout > 0
                    ? setTimeout(() => {
                          reject(Error(`proxy timed out`))
                          source = null
                          cancallable.cancel()
                      }, timeout)
                    : null

            proxy.init_async(GLib.PRIORITY_DEFAULT, cancallable, (_, res) => {
                try {
                    if (source) {
                        clearTimeout(source)
                        source = null
                    }

                    proxy.init_finish(res)
                    this[internals].proxy = proxy

                    const ids = [
                        proxy.connect("g-signal", this.#handleSignal.bind(this)),
                        proxy.connect(
                            "g-properties-changed",
                            this.#handlePropertiesChanged.bind(this),
                        ),
                    ]

                    this[internals].onStop.add(() => {
                        ids.forEach((id) => proxy.disconnect(id))
                        delete this[internals].proxy
                    })

                    resolve(this)
                } catch (error) {
                    reject(error)
                }
            })
        })
    }

    stop() {
        const { onStop } = this[internals]
        for (const cb of onStop.values()) {
            onStop.delete(cb)
            cb()
        }
    }
}

type InterfaceMeta = {
    dbusMethods: Record<
        string,
        Array<{
            name?: string
            type: string
            direction: "in" | "out"
        }>
    >
    dbusSignals: Record<
        string,
        Array<{
            name?: string
            type: string
        }>
    >
    dbusProperties: Record<
        string,
        {
            name: string
            type: string
            read: boolean
            write: boolean
        }
    >
}

const metaMap = new WeakMap<Object, InterfaceMeta>()

function getMeta(object: Object) {
    const meta = metaMap.get(object) ?? { dbusMethods: {}, dbusSignals: {}, dbusProperties: {} }
    metaMap.set(object, meta)
    return meta
}

/**
 * Registers a {@link Service} as a dbus interface.
 *
 * @param name Interface name of the object.
 * @param options optional properties to pass to {@link register}
 *
 * @example
 *
 * ```ts
 * \@iface("org.gnome.Shell.SearchProvider2")
 * class SearchProvider extends Service { }
 * ```
 */
export function iface(name: string, options?: RegisterOptions) {
    return function (constructor: { new (...args: any[]): Service }): void {
        const proto = constructor.prototype
        const meta = getMeta(proto)

        const infoXml = xml({
            name: "node",
            children: [
                {
                    name: "interface",
                    attributes: { name },
                    children: [
                        ...Object.entries(meta.dbusMethods).map(([name, args]) => ({
                            name: "method",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...Object.entries(meta.dbusSignals).map(([name, args]) => ({
                            name: "signal",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...Object.values(meta.dbusProperties).map(
                            ({ name, type, read, write }) => ({
                                name: "property",
                                attributes: {
                                    ...(name && { name }),
                                    type,
                                    access: (read ? "read" : "") + (write ? "write" : ""),
                                },
                            }),
                        ),
                    ],
                },
            ],
        })

        Object.assign(constructor, { [info]: Gio.DBusInterfaceInfo.new_for_xml(infoXml) })
        register(options ?? {})(constructor)
    }
}

type DBusType = string | { type: string; name: string }

type InferDBusTypes<T extends Array<DBusType>> = {
    [K in keyof T]: T[K] extends string
        ? DeepInferVariant<T[K]>
        : T[K] extends { type: infer S }
          ? S extends string
              ? DeepInferVariant<S>
              : never
          : unknown
}

type DBusMethod<InArgs extends DBusType[], OutArgs extends DBusType[]> = (
    this: Service,
    ...args: InferDBusTypes<InArgs>
) => OutArgs extends [] ? void : InferDBusTypes<OutArgs>

type AsyncDBusMethod<InArgs extends DBusType[], OutArgs extends DBusType[]> = (
    this: Service,
    ...args: InferDBusTypes<InArgs>
) => Promise<OutArgs extends [] ? void : InferDBusTypes<OutArgs>>

function installMethod(proto: Service, name: string, args: DBusType[] | [DBusType[], DBusType[]?]) {
    const { dbusMethods } = getMeta(proto)
    const [inArgs, outArgs = []] = (Array.isArray(args[0]) ? args : [args]) as DBusType[][]

    dbusMethods[name] = [
        ...inArgs.map((arg) => ({
            direction: "in" as const,
            ...(typeof arg === "string" ? { type: arg } : arg),
        })),
        ...outArgs.map((arg) => ({
            direction: "out" as const,
            ...(typeof arg === "string" ? { type: arg } : arg),
        })),
    ]
}

function inferGTypeFromVariant(type: DBusType): GObject.GType<any> {
    if (typeof type !== "string") return inferGTypeFromVariant(type.type)

    if (type.startsWith("a") || type.startsWith("(")) {
        return GObject.TYPE_JSOBJECT
    }

    switch (type) {
        case "v":
            return GObject.TYPE_VARIANT
        case "b":
            return GObject.TYPE_BOOLEAN
        case "y":
            return GObject.TYPE_UINT
        case "n":
            return GObject.TYPE_INT
        case "q":
            return GObject.TYPE_UINT
        case "i":
            return GObject.TYPE_INT
        case "u":
            return GObject.TYPE_UINT
        case "x":
            return GObject.TYPE_INT64
        case "t":
            return GObject.TYPE_UINT64
        case "h":
            return GObject.TYPE_INT
        case "d":
            return GObject.TYPE_DOUBLE
        case "s":
        case "g":
        case "o":
            return GObject.TYPE_STRING
        default:
            break
    }

    throw Error(`cannot infer GType from variant "${type}"`)
}

function notImplemented(this: Service): any {
    throw GObject.NotImplementedError()
}

/**
 * Registers a method.
 * You should prefer using {@link methodAsync} when proxying, due to IO blocking.
 *
 * @example
 *
 * ```ts
 * class MyService extends Service {
 *   \@method(["i", "s"], ["s"])
 *   MyMethod(i: number, s: string): [string] {}
 * }
 * ```
 */
export function method<const InArgs extends DBusType[] = [], const OutArgs extends DBusType[] = []>(
    inArgs?: InArgs,
    outArgs?: OutArgs,
): (
    proto: Service,
    name: string,
    descriptor?: TypedPropertyDescriptor<DBusMethod<InArgs, OutArgs>>,
) => void

/**
 * Registers a method.
 * You should prefer using {@link methodAsync} when proxying, due to IO blocking.
 *
 * @example
 *
 * ```ts
 * class MyService extends Service {
 *   \@method("i", "s")
 *   MyMethod(i: number, s: string) {}
 * }
 * ```
 */
export function method<const InArgs extends DBusType[]>(
    ...inArgs: InArgs
): (
    proto: Service,
    name: string,
    descriptor?: TypedPropertyDescriptor<DBusMethod<InArgs, []>>,
) => void

export function method(...args: DBusType[] | [inArgs: DBusType[], outArgs?: DBusType[]]) {
    return function (
        proto: Service,
        name: string,
        descriptor?: TypedPropertyDescriptor<DBusMethod<any, any>>,
    ) {
        installMethod(proto, name, args)

        const method = descriptor?.value ?? notImplemented

        function methodImpl(this: Service, ...args: unknown[]) {
            if (this[internals].proxy) {
                const value = this[remoteMethod](name, args)
                return value.deepUnpack()
            } else {
                return method.apply(this, args)
            }
        }

        if (descriptor) {
            descriptor.value = methodImpl
        } else {
            Object.defineProperty(proto, name, {
                value: methodImpl,
            })
        }
    }
}

/**
 * Registers a method.
 * You should prefer using this over {@link method} when proxying, since this does not block IO.
 *
 * @example
 *
 * ```ts
 * class MyService extends Service {
 *   \@methodAsync("i", "s")
 *   async MyMethod(i: number, s: string): Promise<void> {}
 * }
 * ```
 */
export function methodAsync<
    const InArgs extends DBusType[] = [],
    const OutArgs extends DBusType[] = [],
>(
    inArgs?: InArgs,
    outArgs?: OutArgs,
): (
    proto: Service,
    name: string,
    descriptor?: TypedPropertyDescriptor<AsyncDBusMethod<InArgs, OutArgs>>,
) => void

/**
 * Registers a method.
 * You should prefer using this over {@link method} when proxying, since this does not block IO.
 *
 * @example
 *
 * ```ts
 * class MyService extends Service {
 *   \@method(["i", "s"], ["s"])
 *   async MyMethod(i: number, s: string): Promise<[string]> {}
 * }
 * ```
 */
export function methodAsync<const InArgs extends DBusType[]>(
    ...inArgs: InArgs
): (
    proto: Service,
    name: string,
    descriptor?: TypedPropertyDescriptor<AsyncDBusMethod<InArgs, []>>,
) => void

export function methodAsync(...args: DBusType[] | [inArgs: DBusType[], outArgs?: DBusType[]]) {
    return function (
        proto: Service,
        name: string,
        descriptor?: TypedPropertyDescriptor<AsyncDBusMethod<any, any>>,
    ) {
        installMethod(proto, name, args)

        const method = descriptor?.value ?? notImplemented

        async function methodImpl(this: Service, ...args: unknown[]) {
            if (this[internals].proxy) {
                const value = await this[remoteMethodAsync](name, args)
                return value.deepUnpack()
            } else {
                return method.apply(this, args)
            }
        }

        if (descriptor) {
            descriptor.value = methodImpl
        } else {
            Object.defineProperty(proto, name, {
                value: methodImpl,
            })
        }
    }
}

/**
 * Registers a property.
 *
 * @example
 *
 * ```ts
 * class MyService extends Service {
 *   \@property("s") MyProperty: string = ""
 * }
 * ```
 */
export function property<T extends string>(type: T) {
    return function (
        proto: Service,
        name: string,
        descriptor?: TypedPropertyDescriptor<DeepInferVariant<T>>,
    ) {
        const read = !descriptor || "get" in descriptor
        const write = !descriptor || "set" in descriptor
        const setter = descriptor?.set
        const getter = descriptor?.get

        const override: TypedPropertyDescriptor<DeepInferVariant<T>> = {
            enumerable: true,
            ...(write && {
                set(this: Service, value) {
                    const { proxy, priv } = this[internals]

                    if (proxy) {
                        this[remotePropertySet](name, value)
                        return
                    }

                    if (setter) {
                        setter.call(this, value)
                    } else if (!Object.is(priv[name], value)) {
                        priv[name] = value
                        this.notify(name as Keyof<Service>)
                    }
                },
            }),
            ...(read && {
                get(this: Service) {
                    const { proxy, priv } = this[internals]

                    const value = proxy
                        ? proxy.get_cached_property(name)!.deepUnpack()
                        : getter
                          ? getter.call(this)
                          : priv[name]

                    return value as DeepInferVariant<T>
                },
            }),
        }

        getMeta(proto).dbusProperties[name] = { name, type, read, write }
        gproperty({ $gtype: inferGTypeFromVariant(type) })(proto, name, override)
        Object.defineProperty(proto, name, override)
    }
}

/**
 * Registers a signal which when invoked will emit the signal
 * on the local object and the exported object.
 *
 * **Note**: its not possible to emit signals on remote objects through proxies.
 *
 * ```ts
 * class MyService extends Service {
 *   \@signal("s")
 *   MySignal(s: string): void { }
 * }
 * ```
 */
export function signal<const Params extends DBusType[]>(...params: Params) {
    return function (
        proto: Service,
        name: string,
        descriptor?: TypedPropertyDescriptor<DBusMethod<Params, []>>,
    ) {
        const method = descriptor?.value

        getMeta(proto).dbusSignals[name] = params.map((arg) =>
            typeof arg === "string" ? { type: arg } : arg,
        )

        gsignal(params.map(inferGTypeFromVariant), GObject.VoidType)(proto, name, {
            value(this: Service, ...args: InferDBusTypes<Params>) {
                if (this[internals].proxy) {
                    console.warn(`cannot emit signal "${name}" on remote object`)
                }

                if (this[internals].dbusObject || !this[internals].proxy) {
                    method?.apply(this, args)
                }
            },
        })
    }
}
