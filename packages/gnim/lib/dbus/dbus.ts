import { createGTypeName } from "../util.js"
import { createInterfaceInfo, type InterfaceDeclaration } from "./interface.js"
import {
    createProxyClass,
    createProxyName,
    proxy,
    type ProxyClass,
    type ProxyInstance,
    type ProxyProps,
} from "./proxy.js"
import {
    createServiceClass,
    createServiceName,
    serve,
    type ServeProps,
    type ServiceClass,
    type ServiceEmitter,
    type ServiceImplementation,
    type ServiceInstance,
} from "./service.js"

export interface DBusInterface<T extends InterfaceDeclaration> {
    Proxy: ProxyClass<T>
    Service: ServiceClass<T>
    proxy(props?: ProxyProps): Promise<ProxyInstance<T>>
    serve<S extends ServiceImplementation<T>>(
        props: ServeProps<T, S>,
    ): Promise<ServiceInstance<NoInfer<T>, NoInfer<S>>>
}

export type InferEmitter<T> = T extends DBusInterface<infer I> ? ServiceEmitter<I> : never

export type InferImplementation<T> =
    T extends DBusInterface<infer I> ? ServiceImplementation<I> : never

export function createDBusInterface<T extends InterfaceDeclaration>(
    name: string,
    interfaceDeclaration: T,
): DBusInterface<T> {
    const info = createInterfaceInfo(name, interfaceDeclaration)

    info.cache_build()

    const DBusProxy = createProxyClass(
        info,
        createGTypeName(createProxyName(info.name), import.meta.url),
    )

    const DBusService = createServiceClass(
        info,
        createGTypeName(createServiceName(info.name), import.meta.url),
    )

    return {
        Proxy: DBusProxy,
        Service: DBusService,
        proxy: (props) => proxy(DBusProxy, props),
        serve: (props) => serve(DBusService, props),
    }
}
