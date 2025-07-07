/**
 * A {@link Service} currently only allows interfacing with a single interface of a remote object.
 * In the future I want to come up with an API to be able to create Service objects for multiple
 * interfaces of an object at the same time. Example usage would be for example combining
 * "org.mpris.MediaPlayer2" and "org.mpris.MediaPlayer2.Player" into a single object.
 */
import Gio from "gi://Gio"
import GLib from "gi://GLib"
import GObject from "gi://GObject"
import { definePropertyGetter, kebabify, xml } from "./util.js"
import {
    register,
    property as gproperty,
    signal as gsignal,
    getter as ggetter,
    setter as gsetter,
} from "./gobject.js"

const DEFAULT_TIMEOUT = 10_000

export const Variant = GLib.Variant
export type Variant<T extends string> = GLib.Variant<T>

const info = Symbol("dbus interface info")
const internals = Symbol("dbus interface internals")
const remoteMethod = Symbol("proxy remoteMethod")
const remoteMethodAsync = Symbol("proxy remoteMethodAsync")
const remotePropertySet = Symbol("proxy remotePropertySet")

type Ctx = { private: false; static: false; name: string }

// TODO: consider making some parts public
// - remoteMethod, remoteMethodAsync, remotePropertySet
// - info, proxy, dbusObject

/**
 * Base type for DBus services and proxies. Interface name is set with
 * the {@link iface} decorator which also register it as a GObject type.
 */
export class Service extends GObject.Object {
    static [info]?: Gio.DBusInterfaceInfo

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

    #info: Gio.DBusInterfaceInfo

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

        super.notify(prop ? kebabify(propertyName) : propertyName)
    }

    emit(name: string, ...params: unknown[]): void {
        const signal = this.#info.lookup_signal(name)

        if (signal && this[internals].dbusObject) {
            const signature = `(${signal.args.map((a) => a.signature).join("")})`
            this[internals].dbusObject.emit_signal(name, new GLib.Variant(signature, params))
        }

        return super.emit(signal ? kebabify(name) : name, ...params)
    }

    // server
    #handlePropertyGet(_: Gio.DBusExportedObject, propertyName: Extract<keyof this, string>) {
        const prop = this.#info.lookup_property(propertyName)

        if (!prop) {
            throw Error(`${this.constructor.name} has no exported property: "${propertyName}"`)
        }

        const value = this[propertyName]
        if (typeof value !== "undefined") {
            return new GLib.Variant(prop.signature, value)
        } else {
            return null
        }
    }

    // server
    #handlePropertySet(
        _: Gio.DBusExportedObject,
        propertyName: Extract<keyof this, string>,
        value: GLib.Variant,
    ) {
        const newValue = value.deepUnpack()
        const prop = this.#info.lookup_property(propertyName)

        if (!prop) {
            throw Error(`${this.constructor.name} has no property: "${propertyName}"`)
        }

        if (this[propertyName] !== newValue) {
            this[propertyName] = value.deepUnpack()
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
        methodName: Extract<keyof this, string>,
        parameters: GLib.Variant,
        invocation: Gio.DBusMethodInvocation,
    ): void {
        try {
            const value = (this[methodName] as (...args: unknown[]) => unknown)(
                ...parameters.deepUnpack<Array<unknown>>(),
            )

            if (value instanceof GLib.Variant) {
                invocation.return_value(value)
            } else if (value instanceof Promise) {
                value
                    .then((value) => this.#returnValue(value, methodName, invocation))
                    .catch((error) => this.#returnError(error, invocation))
            } else {
                this.#returnValue(value, methodName, invocation)
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
    }: {
        busType?: Gio.BusType
        name?: string
        objectPath?: string
        flags?: Gio.BusNameOwnerFlags
        timeout?: number
    } = {}): Promise<this> {
        const impl = new Gio.DBusExportedObject(
            // @ts-expect-error missing constructor type
            { g_interface_info: this.#info },
        )

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
                (conn: Gio.DBusConnection) => {
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
    #handlePropertiesChanged(_: Gio.DBusProxy, changed: GLib.Variant, invalidated: string[]) {
        const set = new Set([...Object.keys(changed.deepUnpack()), ...invalidated])
        for (const prop of set.values()) {
            this.notify(prop as Extract<keyof this, string>)
        }
    }

    // proxy
    #handleSignal(
        _: Gio.DBusProxy,
        _sender: string | null,
        signal: string,
        parameters: GLib.Variant,
    ) {
        this.emit(kebabify(signal), ...parameters.deepUnpack<Array<unknown>>())
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
    }: {
        bus?: Gio.DBusConnection
        name?: string
        objectPath?: string
        flags?: Gio.DBusProxyFlags
        timeout?: number
    } = {}): Promise<this> {
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
    dbusMethods?: Record<
        string,
        Array<{
            name?: string
            type: string
            direction: "in" | "out"
        }>
    >
    dbusSignals?: Record<
        string,
        Array<{
            name?: string
            type: string
        }>
    >
    dbusProperties?: Record<
        string,
        {
            name: string
            type: string
            read?: true
            write?: true
        }
    >
}

/**
 * Registers a {@link Service} as a dbus interface.
 *
 * @param name Interface name of the object. For example "org.gnome.Shell.SearchProvider2"
 * @param options optional properties to pass to {@link register}
 */
export function iface(name: string, options?: Parameters<typeof register>[0]) {
    return function (cls: { new (...args: any[]): Service }, ctx: ClassDecoratorContext) {
        const meta = ctx.metadata
        if (!meta) throw Error(`${cls.name} is not an interface`)

        const { dbusMethods = {}, dbusSignals = {}, dbusProperties = {} } = meta as InterfaceMeta

        const infoXml = xml({
            name: "node",
            children: [
                {
                    name: "interface",
                    attributes: { name },
                    children: [
                        ...Object.entries(dbusMethods).map(([name, args]) => ({
                            name: "method",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...Object.entries(dbusSignals).map(([name, args]) => ({
                            name: "signal",
                            attributes: { name },
                            children: args.map((arg) => ({ name: "arg", attributes: arg })),
                        })),
                        ...Object.values(dbusProperties).map(({ name, type, read, write }) => ({
                            name: "property",
                            attributes: {
                                ...(name && { name }),
                                type,
                                access: (read ? "read" : "") + (write ? "write" : ""),
                            },
                        })),
                    ],
                },
            ],
        })

        Object.assign(cls, { [info]: Gio.DBusInterfaceInfo.new_for_xml(infoXml) })
        register(options)(cls, ctx)
    }
}

type DBusType = string | { type: string; name: string }

type DeepInfer<T extends string> = ReturnType<GLib.Variant<T>["deepUnpack"]>

type InferVariantTypes<T extends Array<DBusType>> = {
    [K in keyof T]: T[K] extends string
        ? DeepInfer<T[K]>
        : T[K] extends { type: infer S }
          ? S extends string
              ? DeepInfer<S>
              : never
          : unknown
}

function installMethod<Args extends Array<DBusType>>(
    args: Args | [Args, Args?],
    method: (...args: any[]) => unknown,
    ctx: ClassMethodDecoratorContext<Service, typeof method>,
) {
    const name = ctx.name
    const meta = ctx.metadata! as InterfaceMeta
    const methods = (meta.dbusMethods ??= {})

    if (typeof name !== "string") {
        throw Error("only string named methods are allowed")
    }

    const [inArgs, outArgs = []] = (Array.isArray(args[0]) ? args : [args]) as [Args, Args]

    methods[name] = [
        ...inArgs.map((arg) => ({
            direction: "in" as const,
            ...(typeof arg === "string" ? { type: arg } : arg),
        })),
        ...outArgs.map((arg) => ({
            direction: "out" as const,
            ...(typeof arg === "string" ? { type: arg } : arg),
        })),
    ]

    return name
}

function installProperty<T extends string>(
    type: T,
    ctx: ClassFieldDecoratorContext | ClassGetterDecoratorContext | ClassSetterDecoratorContext,
) {
    const kind = ctx.kind
    const name = ctx.name
    const meta = ctx.metadata! as InterfaceMeta
    const properties = (meta.dbusProperties ??= {})

    if (typeof name !== "string") {
        throw Error("only string named properties are allowed")
    }

    const read = kind === "field" || kind === "getter"
    const write = kind === "field" || kind === "setter"

    if (name in properties) {
        if (write) properties[name].write = true
        if (read) properties[name].read = true
    } else {
        properties[name] = {
            name,
            type,
            ...(read && { read }),
            ...(write && { write }),
        }
    }

    return name
}

function installSignal<Params extends Array<DBusType>>(
    params: Params,
    ctx: ClassMethodDecoratorContext<Service>,
) {
    const name = ctx.name
    const meta = ctx.metadata! as InterfaceMeta
    const signals = (meta.dbusSignals ??= {})

    if (typeof name === "symbol") {
        throw Error("symbols are not valid signals")
    }

    signals[name] = params.map((arg) => (typeof arg === "string" ? { type: arg } : arg))

    return name
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

/**
 * Registers a method.
 * You should prefer using {@link methodAsync} when proxying, due to IO blocking.
 * Note that this is functionally the same as {@link methodAsync} on exported objects.
 * ```
 */
export function method<const InArgs extends Array<DBusType>, const OutArgs extends Array<DBusType>>(
    inArgs: InArgs,
    outArgs: OutArgs,
): (
    method: (this: Service, ...args: InferVariantTypes<InArgs>) => InferVariantTypes<OutArgs>,
    ctx: ClassMethodDecoratorContext<Service, typeof method>,
) => void

/**
 * Registers a method.
 * You should prefer using {@link methodAsync} when proxying, due to IO blocking.
 * Note that this is functionally the same as {@link methodAsync} on exported objects.
 * ```
 */
export function method<const InArgs extends Array<DBusType>>(
    ...inArgs: InArgs
): (
    method: (this: Service, ...args: InferVariantTypes<InArgs>) => void,
    ctx: ClassMethodDecoratorContext<Service, typeof method>,
) => void

export function method<const InArgs extends Array<DBusType>, const OutArgs extends Array<DBusType>>(
    ...args: InArgs | [inArgs: InArgs, outArgs?: OutArgs]
) {
    return function (
        method: (
            this: Service,
            ...args: InferVariantTypes<InArgs>
        ) => InferVariantTypes<OutArgs> | void,
        ctx: ClassMethodDecoratorContext<Service, typeof method>,
    ): typeof method {
        const name = installMethod(args, method, ctx)

        return function (...args: InferVariantTypes<InArgs>) {
            if (this[internals].proxy) {
                const value = this[remoteMethod](name, args)
                return value.deepUnpack<InferVariantTypes<OutArgs>>()
            } else {
                return method.apply(this, args)
            }
        }
    }
}

/**
 * Registers a method.
 * You should prefer using this over {@link method} when proxying, since this does not block IO.
 * Note that this is functionally the same as {@link method} on exported objects.
 * ```
 */
export function methodAsync<
    const InArgs extends Array<DBusType>,
    const OutArgs extends Array<DBusType>,
>(
    inArgs: InArgs,
    outArgs: OutArgs,
): (
    method: (
        this: Service,
        ...args: InferVariantTypes<InArgs>
    ) => Promise<InferVariantTypes<OutArgs>>,
    ctx: ClassMethodDecoratorContext<Service, typeof method>,
) => void

/**
 * Registers a method.
 * You should prefer using this over {@link method} when proxying, since this does not block IO.
 * Note that this is functionally the same as {@link method} on exported objects.
 * ```
 */
export function methodAsync<const InArgs extends Array<DBusType>>(
    ...inArgs: InArgs
): (
    method: (this: Service, ...args: InferVariantTypes<InArgs>) => Promise<void>,
    ctx: ClassMethodDecoratorContext<Service, typeof method>,
) => void

export function methodAsync<
    const InArgs extends Array<DBusType>,
    const OutArgs extends Array<DBusType>,
>(...args: InArgs | [inArgs: InArgs, outArgs?: OutArgs]) {
    return function (
        method: (
            this: Service,
            ...args: InferVariantTypes<InArgs>
        ) => Promise<InferVariantTypes<OutArgs> | void>,
        ctx: ClassMethodDecoratorContext<Service, typeof method>,
    ): typeof method {
        const name = installMethod(args, method, ctx)

        return async function (...args: InferVariantTypes<InArgs>) {
            if (this[internals].proxy) {
                const value = await this[remoteMethodAsync](name, args)
                return value.deepUnpack<InferVariantTypes<OutArgs>>()
            } else {
                return method.apply(this, args)
            }
        }
    }
}

/**
 * Registers a read-write property. When a new value is assigned the notify signal
 * is automatically emitted on the local and exported object.
 *
 * Note that new values are checked by reference so assigning the same object will
 * not emit the notify signal.
 * ```
 */
export function property<T extends string>(type: T) {
    return function (
        _: void,
        ctx: ClassFieldDecoratorContext<Service, DeepInfer<T>>,
    ): (this: Service, init: DeepInfer<T>) => DeepInfer<T> {
        const name = installProperty(type, ctx)

        void gproperty({ $gtype: inferGTypeFromVariant(type) })(
            _,
            ctx as ClassFieldDecoratorContext<GObject.Object> & Ctx,
            { metaOnly: true },
        )

        ctx.addInitializer(function () {
            Object.defineProperty(this, name, {
                configurable: false,
                enumerable: true,
                set(value: DeepInfer<T>) {
                    const { proxy, priv } = this[internals]

                    if (proxy) {
                        this[remotePropertySet](name, value)
                        return
                    }

                    if (priv[name] !== value) {
                        priv[name] = value
                        this.notify(name as Extract<keyof Service, string>)
                    }
                },
                get(): DeepInfer<T> {
                    const { proxy, priv } = this[internals]

                    return proxy
                        ? proxy.get_cached_property(name)!.deepUnpack<DeepInfer<T>>()
                        : (priv[name] as DeepInfer<T>)
                },
            } satisfies ThisType<Service>)
        })

        return function (init) {
            const priv = this[internals].priv
            priv[name] = init
            // we don't need to store the value on the object
            return void 0 as unknown as DeepInfer<T>
        }
    }
}

/**
 * Registers a read-only property. Can be used in conjuction with {@link setter} to define
 * read-write properties as accessors.
 *
 * Note that you will need to explicitly emit the notify signal.
 */
export function getter<T extends string>(type: T) {
    return function (
        getter: (this: Service) => DeepInfer<T>,
        ctx: ClassGetterDecoratorContext<Service, DeepInfer<T>>,
    ): (this: Service) => DeepInfer<T> {
        const name = installProperty(type, ctx)

        ctx.addInitializer(function () {
            definePropertyGetter(this, name as Extract<keyof Service, string>)
        })

        void ggetter({ $gtype: inferGTypeFromVariant(type) })(
            () => {},
            ctx as ClassGetterDecoratorContext<GObject.Object> & Ctx,
        )

        return function () {
            const { proxy } = this[internals]
            return proxy
                ? proxy.get_cached_property(name)!.deepUnpack<DeepInfer<T>>()
                : getter.call(this)
        }
    }
}

/**
 * Registers a write-only property. Can be used in conjuction with {@link getter} to define
 * read-write properties as accessors.
 *
 * Note that you will need to explicitly emit the notify signal.
 */
export function setter<T extends string>(type: T) {
    return function (
        setter: (this: Service, value: DeepInfer<T>) => void,
        ctx: ClassSetterDecoratorContext<Service, DeepInfer<T>>,
    ): (this: Service, value: DeepInfer<T>) => void {
        const name = installProperty(type, ctx)

        void gsetter({ $gtype: inferGTypeFromVariant(type) })(
            () => {},
            ctx as ClassSetterDecoratorContext<GObject.Object> & Ctx,
        )

        return function (value: DeepInfer<T>) {
            const { proxy } = this[internals]

            if (proxy) {
                this[remotePropertySet](name, value)
            } else {
                setter.call(this, value)
            }
        }
    }
}

/**
 * Registers a signal which when invoked will emit the signal
 * on the local object and the exported object.
 *
 * **Note**: its not possible to emit signals on remote objects through proxies.
 */
export function signal<const Params extends Array<DBusType>>(...params: Params) {
    return function (
        method: (this: Service, ...params: InferVariantTypes<Params>) => void,
        ctx: ClassMethodDecoratorContext<Service, typeof method>,
    ): typeof method {
        const name = installSignal(params, ctx)

        void gsignal(...params.map(inferGTypeFromVariant))(
            () => {},
            ctx as ClassMethodDecoratorContext<GObject.Object> & Ctx,
        )

        return function (...params: InferVariantTypes<Params>) {
            if (this[internals].proxy) {
                console.warn(`cannot emit signal "${name}" on remote object`)
            }

            if (this[internals].dbusObject || !this[internals].proxy) {
                method.apply(this, params)
            }

            return this.emit(name, ...params)
        }
    }
}
