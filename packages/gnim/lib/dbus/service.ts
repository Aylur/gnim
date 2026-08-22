import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { pspecFromGType } from "../gobject/gtype.js"
import { findDescriptor, gtypeNamePrefix, kebabcase, pascalcase } from "../util.js"
import {
    inferGType,
    type DBusGObject,
    type InterfaceDeclaration,
    type InterfaceInfo,
    type Methods,
    type ReadableProperties,
    type ReadOnlyProperties,
    type Signals,
    type WritableProperties,
} from "./interface.js"

type ServiceMethods<T extends InterfaceDeclaration> = {
    [K in keyof Methods<T>]: (
        ...args: Methods<T>[K]["in"]
    ) => Promise<Methods<T>[K]["out"]> | Methods<T>[K]["out"]
}

export type ServiceImplementation<T extends InterfaceDeclaration> = ReadOnlyProperties<T> &
    WritableProperties<T> &
    ServiceMethods<T>

type PropertyNotifiers<T extends InterfaceDeclaration> = {
    [K in keyof ReadableProperties<T>]: () => void
}

type SignalEmitters<T extends InterfaceDeclaration> = {
    [K in keyof Signals<T>]: (...args: Signals<T>[K]) => void
}

export type ServiceEmitter<T extends InterfaceDeclaration> = PropertyNotifiers<T> &
    SignalEmitters<T>

export type ServiceImplementationFactory<
    T extends InterfaceDeclaration,
    S extends ServiceImplementation<T>,
> = (emitter: ServiceEmitter<T>) => S

export type ServiceInstance<
    T extends InterfaceDeclaration,
    S extends ServiceImplementation<T>,
> = DBusGObject<T> & {
    [K in keyof S as K extends keyof ServiceImplementation<T> ? K : never]: S[K]
} & {
    implementation: S
    export(connection: Gio.DBusConnection, objectPath: string): boolean
    unexport(): void
}

interface ServiceClass<T extends InterfaceDeclaration> {
    readonly $gtype: GObject.GType<ServiceInstance<T, ServiceImplementation<any>>>
    readonly info: InterfaceInfo<T>

    new <S extends ServiceImplementation<T>>(
        impl: ServiceImplementationFactory<T, S>,
    ): ServiceInstance<T, NoInfer<S>>
}
export function createServiceClass<T extends InterfaceDeclaration>(
    info: InterfaceInfo<T>,
): ServiceClass<T>

export function createServiceClass(info: Gio.DBusInterfaceInfo): any {
    const { READABLE, WRITABLE } = Gio.DBusPropertyInfoFlags

    return class DBusService extends GObject.Object {
        static info = info
        static name = info.name

        #dbusObject: Gio.DBusExportedObject
        implementation: Record<string, unknown>

        static {
            const name =
                gtypeNamePrefix(import.meta.url) +
                pascalcase(info.name.replaceAll(".", "_")) +
                "Service"

            const props = info.properties.map((prop) => {
                const gtype = inferGType(prop.signature)
                const name = kebabcase(prop.name)

                Object.defineProperty(this.prototype, prop.name, {
                    configurable: true,
                    get: function get(this: DBusService) {
                        if ((prop.flags & READABLE) !== READABLE) {
                            throw Error(`property "${prop.name}" is not readable`)
                        }
                        return this.implementation[prop.name]
                    },
                    set: function set(this: DBusService, value: unknown) {
                        if ((prop.flags & WRITABLE) !== WRITABLE) {
                            throw Error(`property "${prop.name}" is not writable`)
                        }
                        this.#setProperty(prop.name, value)
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
                    value: function callMethod(this: DBusService, ...args: unknown[]) {
                        return this.#callMethod(name, ...args)
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

        constructor(
            impl: ServiceImplementationFactory<
                InterfaceDeclaration,
                ServiceImplementation<InterfaceDeclaration>
            >,
        ) {
            super()

            this.#dbusObject = new Gio.DBusExportedObject({ gInterfaceInfo: info })
            this.#dbusObject.connect("handle-property-get", this.#handlePropertyGet.bind(this))
            this.#dbusObject.connect("handle-property-set", this.#handlePropertySet.bind(this))
            this.#dbusObject.connect("handle-method-call", (self, name, arg1, arg2) => {
                if (arg1 instanceof GLib.Variant) {
                    this.#handleMethodCall(self, name, arg1, arg2 as Gio.DBusMethodInvocation)
                } else {
                    this.#handleMethodCall(self, name, arg2 as GLib.Variant, arg1)
                }
            })

            const signalEmitters = info.signals.map((signal) => {
                const signalEmitter = (...args: unknown[]) => {
                    const signature = `(${signal.args.map((arg) => arg.signature).join("")})`
                    this.#dbusObject.emit_signal(signal.name, new GLib.Variant(signature, args))
                    GObject.signal_emit_by_name(this, kebabcase(signal.name), ...args)
                }
                return [signal.name, signalEmitter] as const
            })

            const propertyNotifiers = info.properties
                .filter((prop) => (prop.flags & READABLE) === READABLE)
                .map((prop) => {
                    const propertyNotifier = () => {
                        this.#dbusObject.emit_property_changed(
                            prop.name,
                            new GLib.Variant(prop.signature, this.implementation[prop.name]),
                        )
                        this.notify(kebabcase(prop.name))
                    }
                    return [prop.name, propertyNotifier] as const
                })

            this.implementation = impl(
                Object.fromEntries([...signalEmitters, ...propertyNotifiers]),
            )
        }

        export(connection: Gio.DBusConnection, objectPath: string): boolean {
            return this.#dbusObject.export(connection, objectPath)
        }

        unexport() {
            return this.#dbusObject.unexport()
        }

        #setProperty(propertyName: string, value: unknown) {
            const prop = this.#dbusObject.get_info().lookup_property(propertyName)
            if (!prop) {
                console.warn(Error(`cannot find property info "${propertyName}"`))
                return
            }

            if ((prop.flags & WRITABLE) !== WRITABLE) {
                console.warn(Error(`cannot set property "${propertyName}": not writable`))
                return
            }

            if ((prop.flags & READABLE) !== READABLE) {
                try {
                    return (this.implementation[propertyName] = value)
                } catch (err) {
                    console.error(err)
                }
            }

            const isDataProperty =
                typeof findDescriptor(this.implementation, propertyName)?.get === "undefined" &&
                typeof findDescriptor(this.implementation, propertyName) !== "undefined"

            if (isDataProperty) {
                if (this.implementation[propertyName] !== value) {
                    this.implementation[propertyName] = value
                    this.#dbusObject.emit_property_changed(
                        propertyName,
                        new GLib.Variant(prop.signature, this.implementation[propertyName]),
                    )
                    this.notify(kebabcase(prop.name))
                }
            } else {
                this.implementation[prop.name] = value
            }
        }

        #handlePropertyGet(_: Gio.DBusExportedObject, propertyName: string) {
            const prop = this.#dbusObject.get_info().lookup_property(propertyName)
            if (!prop) {
                console.warn(Error(`cannot find property info "${propertyName}"`))
                return null
            }

            try {
                const value = this.implementation[prop.name]
                if (typeof value !== "undefined") {
                    return new GLib.Variant(prop.signature, value)
                }
            } catch (err) {
                console.error(err)
            }
            return null
        }

        #handlePropertySet(_: Gio.DBusExportedObject, propertyName: string, value: GLib.Variant) {
            const prop = this.#dbusObject.get_info().lookup_property(propertyName)
            if (!prop) {
                console.warn(Error(`cannot find property info "${propertyName}"`))
                return
            }

            if (prop.signature !== value.get_type_string()) {
                console.warn(
                    Error(
                        `cannot set property "${propertyName}": invalid variant ${value.get_type_string()}, expected ${prop.signature}`,
                    ),
                )
                return
            }

            try {
                this.#setProperty(propertyName, value.deepUnpack())
            } catch (err) {
                console.error(err)
            }
        }

        #returnError(error: unknown, invocation: Gio.DBusMethodInvocation) {
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

        #returnValue(value: unknown, methodName: string, invocation: Gio.DBusMethodInvocation) {
            if (value === null || value === undefined) {
                return invocation.return_value(new GLib.Variant("()", []))
            }

            const args = this.#dbusObject.get_info().lookup_method(methodName)?.out_args ?? []
            const signature = `(${args.map((arg) => arg.signature).join("")})`
            if (!Array.isArray(value)) throw Error("value has to be a tuple")
            invocation.return_value(new GLib.Variant(signature, value))
        }

        #callMethod(methodName: string, ...args: unknown[]): unknown {
            const method = this.implementation[methodName]
            if (typeof method !== "function") {
                throw Error(`missing method implementation for "${methodName}"`)
            }

            return method.call(this.implementation, ...args)
        }

        async #handleMethodCall(
            _: Gio.DBusExportedObject,
            methodName: string,
            parameters: GLib.Variant,
            invocation: Gio.DBusMethodInvocation,
        ): Promise<void> {
            try {
                const args = parameters.deepUnpack() as Iterable<unknown>
                const value = this.#callMethod(methodName, ...args)

                if (value instanceof GLib.Variant) {
                    invocation.return_value(value)
                } else if (value instanceof Promise) {
                    this.#returnValue(await value, methodName, invocation)
                } else {
                    this.#returnValue(value, methodName, invocation)
                }
            } catch (error) {
                this.#returnError(error, invocation)
            }
        }
    }
}
