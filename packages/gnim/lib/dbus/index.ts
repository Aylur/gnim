export {
    createInterfaceInfo,
    method,
    signal,
    property,
    type MethodDeclaration,
    type SignalDeclaration,
    type PropertyDeclaration,
    type ReadOnlyPropertyDeclaration,
    type WriteOnlyPropertyDeclaration,
} from "./interface.js"

export {
    proxy,
    createProxyClass,
    type ProxyProps,
    type ProxyInstance,
    type ProxyClass,
} from "./proxy.js"

export {
    serve,
    createServiceClass,
    type ServeProps,
    type ServiceInstance,
    type ServiceClass,
    type ServiceEmitter,
    type ServiceImplementation,
} from "./service.js"

export {
    createDBusInterface,
    type DBusInterface,
    type InferEmitter,
    type InferImplementation,
} from "./dbus.js"

import GLib from "gi://GLib?version=2.0"
export const Variant = GLib.Variant
export type Variant<T extends string = any> = GLib.Variant<T>
