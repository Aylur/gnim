import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { pspecFromGType } from "../gobject/gtype.js"
import { gtypeNamePrefix, kebabcase, pascalcase } from "../util.js"
import {
    inferGType,
    type DBusGObject,
    type InterfaceDeclaration,
    type InterfaceInfo,
    type Methods,
    type ReadOnlyProperties,
    type WritableProperties,
} from "./interface.js"

type ProxyMethods<T extends InterfaceDeclaration> = {
    [K in keyof Methods<T>]: (
        ...args: Methods<T>[K]["in"]
    ) => Promise<Methods<T>[K]["out"] extends void ? [] : Methods<T>[K]["out"]>
}

export type ProxyInstance<T extends InterfaceDeclaration> = DBusGObject<T> &
    ReadOnlyProperties<T> &
    WritableProperties<T> &
    ProxyMethods<T> & {
        init(cancellable?: Gio.Cancellable | null): boolean
        initAsync(ioPriority?: number, cancellable?: Gio.Cancellable | null): Promise<boolean>
    }

export interface ProxyProps {
    bus?: Gio.DBusConnection
    name?: string
    objectPath?: string
    flags?: Gio.DBusProxyFlags
    timeout?: number
}

interface ProxyClass<T extends InterfaceDeclaration> {
    readonly $gtype: GObject.GType<ProxyInstance<T>>
    readonly info: InterfaceInfo<T>
    new (props?: ProxyProps): ProxyInstance<T>
}

export function createProxyClass<T extends InterfaceDeclaration>(
    info: InterfaceInfo<T>,
): ProxyClass<T>

export function createProxyClass(info: Gio.DBusInterfaceInfo): any {
    return class DBusProxy extends GObject.Object {
        static info = info as InterfaceInfo<any>
        static name = info.name

        static {
            const { READABLE, WRITABLE } = Gio.DBusPropertyInfoFlags

            const name =
                gtypeNamePrefix(import.meta.url) +
                pascalcase(info.name.replaceAll(".", "_")) +
                "Proxy"

            const props = info.properties.map((prop) => {
                const gtype = inferGType(prop.signature)
                const name = kebabcase(prop.name)

                Object.defineProperty(this.prototype, prop.name, {
                    configurable: true,
                    get: function get(this: DBusProxy) {
                        if ((prop.flags & READABLE) !== READABLE) {
                            throw Error(`property "${prop.name}" is not readable`)
                        }
                        return this.#getCachedProperty(prop.name)
                    },
                    set: function set(this: DBusProxy, v: unknown) {
                        if ((prop.flags & WRITABLE) !== WRITABLE) {
                            throw Error(`property "${prop.name}" is not writable`)
                        }
                        this.#setProperty(prop.name, v).catch(console.error)
                    },
                })

                return [name, pspecFromGType(gtype, name, prop.flags)] as const
            })

            const signals = info.signals.map(({ args, name }) => {
                const param_types = args.map((arg) => inferGType(arg.signature))
                return [kebabcase(name), { param_types }] as const
            })

            for (const { name } of info.methods) {
                Object.defineProperty(this.prototype, name, {
                    configurable: true,
                    value: function invokeMethod(this: DBusProxy, ...args: unknown[]) {
                        return this.#invokeMethod(name, args)
                    },
                })
            }

            GObject.registerClass(
                {
                    GTypeName: name,
                    Properties: Object.fromEntries(props),
                    Signals: Object.fromEntries(signals),
                },
                this,
            )
        }

        constructor(props?: ProxyProps) {
            super()

            this.#proxy = new Gio.DBusProxy({
                gInterfaceName: info.name,
                gInterfaceInfo: info,
                gConnection: props?.bus ?? Gio.DBus.session,
                gName: props?.name ?? info.name,
                gObjectPath: props?.objectPath ?? "/" + info.name.split(".").join("/"),
                gFlags: props?.flags ?? Gio.DBusProxyFlags.NONE,
                gDefaultTimeout: props?.timeout ?? 10_000,
            })

            this.#proxy.connect("g-properties-changed", this.#handlePropertiesChanged.bind(this))
            this.#proxy.connect("g-signal", this.#handleSignal.bind(this))
        }

        init(cancellable: Gio.Cancellable | null = null) {
            return this.#proxy.init(cancellable)
        }

        initAsync(
            ioPriority = GLib.PRIORITY_DEFAULT,
            cancellable: Gio.Cancellable | null = null,
        ): Promise<boolean> {
            return new Promise((resolve, reject) => {
                this.#proxy.init_async(ioPriority, cancellable, (_, res) => {
                    try {
                        resolve(this.#proxy.init_finish(res))
                    } catch (err) {
                        reject(err)
                    }
                })
            })
        }

        #proxy: Gio.DBusProxy

        #propertyCache = new Map<string, unknown>()

        #getCachedProperty(name: string): unknown {
            if (!this.#proxy.gInterfaceInfo.lookup_property(name)) {
                throw Error(`cannot get unknown property "${name}"`)
            }

            if (this.#propertyCache.has(name)) {
                return this.#propertyCache.get(name)
            }

            let value = this.#proxy.get_cached_property(name)

            if (!value) {
                console.debug(`property "${name} is not in cache, fetching with a blocking call"`)

                value = this.#proxy.call_sync(
                    "org.freedesktop.DBus.Properties.Get",
                    new GLib.Variant("(ss)", [this.#proxy.gInterfaceName, name]),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                )
            }

            const result = value.deepUnpack()
            this.#propertyCache.set(name, result)
            return result
        }

        #handlePropertiesChanged(
            _self: Gio.DBusProxy,
            changed: GLib.Variant<"a{sv}">,
            invalidated: string[],
        ) {
            const names = new Set([...Object.keys(changed.deepUnpack()), ...invalidated])

            for (const name of names) {
                if (this.#proxy.gInterfaceInfo.lookup_property(name)) {
                    this.#propertyCache.delete(name)
                    this.notify(kebabcase(name))
                }
            }
        }

        #handleSignal(
            _self: Gio.DBusProxy,
            _sender: string | null,
            signal: string,
            parameters: GLib.Variant,
        ) {
            if (this.#proxy.gInterfaceInfo.lookup_signal(signal)) {
                const params = parameters.deepUnpack() as Iterable<unknown>
                GObject.signal_emit_by_name(this, kebabcase(signal), ...params)
            }
        }

        #invokeMethod(methodName: string, args: unknown[]): Promise<unknown> {
            const method = this.#proxy.gInterfaceInfo.lookup_method(methodName)
            if (!method) throw Error(`cannot invoke unknown method "${methodName}"`)

            const signature = `(${method.in_args.map((a) => a.signature).join("")})`

            return new Promise((resolve, reject) => {
                this.#proxy.call(
                    methodName,
                    new GLib.Variant(signature, args),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (_, res) => {
                        try {
                            resolve(this.#proxy.call_finish(res).deepUnpack())
                        } catch (error) {
                            reject(error)
                        }
                    },
                )
            })
        }

        #setProperty(name: string, value: unknown): Promise<GLib.Variant<"()">> {
            const prop = this.#proxy.gInterfaceInfo.lookup_property(name)
            if (!prop) throw Error(`cannot set unknown property ${name}`)

            const { READABLE } = Gio.DBusPropertyInfoFlags
            const readable = (prop.flags & READABLE) === READABLE

            const rollbackVariant = readable ? this.#proxy.get_cached_property(name) : null
            const rollbackValue = readable ? this.#getCachedProperty(name) : undefined
            const variant = new GLib.Variant(prop.signature, value)

            if (readable) {
                this.#propertyCache.set(name, value)
                this.#proxy.set_cached_property(name, variant)
            }

            return new Promise((resolve, reject) => {
                this.#proxy.call(
                    "org.freedesktop.DBus.Properties.Set",
                    new GLib.Variant("(ssv)", [this.#proxy.gInterfaceName, name, variant]),
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null,
                    (_, res) => {
                        try {
                            resolve(this.#proxy.call_finish(res))
                        } catch (e) {
                            if (readable) {
                                this.#proxy.set_cached_property(name, rollbackVariant)
                                this.#propertyCache.set(name, rollbackValue)
                            }
                            reject(e)
                        }
                    },
                )
            })
        }
    }
}
