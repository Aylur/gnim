import Gio from "gi://Gio?version=2.0"
import {
    createInterfaceInfo,
    MethodDeclaration,
    PropertyDeclaration,
    SignalDeclaration,
    type InterfaceDeclaration,
} from "./interface.js"
import { createProxyClass, type ProxyInstance, type ProxyProps } from "./proxy.js"
import {
    createServiceClass,
    type ServiceEmitter,
    type ServiceImplementation,
    type ServiceImplementationFactory,
    type ServiceInstance,
} from "./service.js"

export { createInterfaceInfo } from "./interface.js"
export { createProxyClass, type ProxyProps } from "./proxy.js"
export { createServiceClass } from "./service.js"

export const { method } = MethodDeclaration
export const { signal } = SignalDeclaration
export const { property } = PropertyDeclaration

export interface ServeProps<T extends InterfaceDeclaration, S extends ServiceImplementation<T>> {
    busType?: Gio.BusType
    name?: string
    objectPath?: string
    flags?: Gio.BusNameOwnerFlags
    timeout?: number
    implementation: ServiceImplementationFactory<T, S>
}

export interface DBusInterface<T extends InterfaceDeclaration> {
    proxy(props?: ProxyProps): Promise<ProxyInstance<T>>
    serve<S extends ServiceImplementation<T>>(
        props: ServeProps<T, S>,
    ): Promise<ServiceInstance<NoInfer<T>, NoInfer<S>>>
}

export type InferImplementation<T> =
    T extends DBusInterface<infer I> ? ServiceImplementation<I> : never

export type InferEmitter<T> = T extends DBusInterface<infer I> ? ServiceEmitter<I> : never

export type InferProxy<T> = T extends DBusInterface<infer I> ? ProxyInstance<I> : never

export function createDBusInterface<T extends InterfaceDeclaration>(
    name: string,
    interfaceDeclaration: T,
): DBusInterface<T> {
    const info = createInterfaceInfo(name, interfaceDeclaration)

    info.cache_build()

    const DBusProxy = createProxyClass(info)
    const DBusService = createServiceClass(info)

    return {
        async proxy(props) {
            const proxy = new DBusProxy(props)
            await proxy.initAsync()
            return proxy
        },
        async serve({ implementation, timeout = 10_000, busType, flags, name, objectPath }) {
            return new Promise((resolve, reject) => {
                busType ??= Gio.BusType.SESSION
                name ??= info.name
                flags ??= Gio.BusNameOwnerFlags.NONE
                objectPath ??= "/" + info.name.split(".").join("/")

                const service = new DBusService(implementation)
                const unexport = service.unexport.bind(service)

                Object.defineProperty(service, "unexport", {
                    value() {
                        unexport()
                        Gio.bus_unown_name(busId)
                    },
                })

                let timeoutSource =
                    timeout > 0
                        ? setTimeout(() => {
                              timeoutSource = null
                              reject(Error("serve timed out"))
                          }, timeout)
                        : null

                const clearServeTimeout = () => {
                    if (timeoutSource) {
                        clearTimeout(timeoutSource)
                        timeoutSource = null
                    }
                }

                const busId = Gio.bus_own_name(
                    busType,
                    name,
                    flags,
                    (conn) => {
                        clearServeTimeout()
                        try {
                            service.export(conn, objectPath!)
                        } catch (error) {
                            reject(error)
                        }
                    },
                    () => {
                        clearServeTimeout()
                        resolve(service as any)
                    },
                    (conn) => {
                        clearServeTimeout()
                        unexport()
                        if (!conn) {
                            reject(Error("could not connect to the bus"))
                        } else {
                            reject(Error(`dbus name "${name}" is owned by another process`))
                        }
                    },
                )
            })
        },
    }
}
