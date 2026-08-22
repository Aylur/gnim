import GObject from "gi://GObject?version=2.0"
import { xml, type DeepInferVariant, type KebabCase, type XmlNode } from "../util.js"
import Gio from "gi://Gio?version=2.0"

type TypeDeclaration = string | { type: string; name: string }

export interface ReadOnlyPropertyDeclaration<Type extends string = string> {
    typeSignature: Type
    access: "read"
    toXml(name: string): XmlNode
}

export interface WriteOnlyPropertyDeclaration<Type extends string = string> {
    typeSignature: Type
    access: "write"
    toXml(name: string): XmlNode
}

export interface ReadWritePropertyDeclaration<Type extends string = string> {
    typeSignature: Type
    access: "readwrite"
    toXml(name: string): XmlNode
}

export class PropertyDeclaration<Type extends string = string> {
    typeSignature: Type
    access: "read" | "write" | "readwrite"

    constructor(type: Type, access: "r" | "w" | "rw") {
        this.typeSignature = type
        switch (access) {
            case "r":
                this.access = "read"
                break
            case "w":
                this.access = "write"
                break
            case "rw":
                this.access = "readwrite"
                break
        }
    }

    toXml(name: string): XmlNode {
        const attributes = {
            name,
            type: this.typeSignature,
            access: this.access,
        }

        return { name: "property", attributes }
    }

    static property<const Type extends string>(type: Type): ReadWritePropertyDeclaration<Type>
    static property<const Type extends string>(
        type: Type,
        flags: "r",
    ): ReadOnlyPropertyDeclaration<Type>
    static property<const Type extends string>(
        type: Type,
        flags: "w",
    ): WriteOnlyPropertyDeclaration<Type>

    static property<const Type extends string>(type: Type, flags: "r" | "w" | "rw" = "rw") {
        return new PropertyDeclaration<Type>(type, flags)
    }
}

export class SignalDeclaration<ArgTypes extends TypeDeclaration[] = TypeDeclaration[]> {
    args: ArgTypes

    constructor(args: ArgTypes) {
        this.args = args
    }

    toXml(name: string): XmlNode {
        const args = this.args.map((arg) => ({
            name: "arg",
            attributes: typeof arg === "string" ? { type: arg } : arg,
        }))

        return {
            name: "signal",
            attributes: { name },
            children: args,
        }
    }

    static signal<const ArgTypes extends TypeDeclaration[]>(...args: ArgTypes) {
        return new SignalDeclaration<ArgTypes>(args)
    }
}

export class MethodDeclaration<
    In extends TypeDeclaration[] = TypeDeclaration[],
    Out extends TypeDeclaration[] = TypeDeclaration[],
> {
    inargs: In
    outargs: Out

    constructor(inargs: In, outargs: Out) {
        this.inargs = inargs
        this.outargs = outargs
    }

    toXml(name: string): XmlNode {
        const inargs = this.inargs.map((arg) => ({
            name: "arg",
            attributes: {
                direction: "in",
                ...(typeof arg === "string" ? { type: arg } : arg),
            },
        }))

        const outargs = this.outargs.map((arg) => ({
            name: "arg",
            attributes: {
                direction: "out",
                ...(typeof arg === "string" ? { type: arg } : arg),
            },
        }))

        return {
            name: "method",
            attributes: { name },
            children: [...inargs, ...outargs],
        }
    }

    static method<const In extends TypeDeclaration[]>(...inargs: In): MethodDeclaration<In, []>

    static method<
        const In extends TypeDeclaration[],
        const Out extends TypeDeclaration[] = TypeDeclaration[],
    >(inargs: In, outargs: Out): MethodDeclaration<In, Out>

    static method(...args: [TypeDeclaration[], TypeDeclaration[]] | TypeDeclaration[]) {
        if (args.length === 2 && Array.isArray(args[0]) && Array.isArray(args[1])) {
            return new MethodDeclaration(args[0], args[1])
        }
        return new MethodDeclaration(args as TypeDeclaration[], [])
    }
}

type InferParams<T extends Array<TypeDeclaration>> = {
    [K in keyof T]: T[K] extends string
        ? DeepInferVariant<T[K]>
        : T[K] extends { type: infer S }
          ? S extends string
              ? DeepInferVariant<S>
              : never
          : unknown
}

export type InterfaceDeclaration = Record<
    string,
    PropertyDeclaration | MethodDeclaration | SignalDeclaration
>

export type ReadOnlyProperties<T extends InterfaceDeclaration> = {
    readonly [
        K in keyof T as T[K] extends ReadOnlyPropertyDeclaration ? K : never
    ]: T[K] extends ReadOnlyPropertyDeclaration<infer Type> ? DeepInferVariant<Type> : never
}

export type WriteOnlyProperties<T extends InterfaceDeclaration> = {
    [
        K in keyof T as T[K] extends WriteOnlyPropertyDeclaration ? K : never
    ]: T[K] extends WriteOnlyPropertyDeclaration<infer Type> ? DeepInferVariant<Type> : never
}

export type WritableProperties<T extends InterfaceDeclaration> = {
    [
        K in keyof T as T[K] extends WriteOnlyPropertyDeclaration | ReadWritePropertyDeclaration
            ? K
            : never
    ]: T[K] extends WriteOnlyPropertyDeclaration<infer Type>
        ? DeepInferVariant<Type>
        : T[K] extends ReadWritePropertyDeclaration<infer Type>
          ? DeepInferVariant<Type>
          : never
}

export type ReadableProperties<T extends InterfaceDeclaration> = {
    [
        K in keyof T as T[K] extends ReadOnlyPropertyDeclaration | ReadWritePropertyDeclaration
            ? K
            : never
    ]: T[K] extends ReadOnlyPropertyDeclaration<infer Type>
        ? DeepInferVariant<Type>
        : T[K] extends ReadWritePropertyDeclaration<infer Type>
          ? DeepInferVariant<Type>
          : never
}

export type Methods<T extends InterfaceDeclaration> = {
    [K in keyof T as T[K] extends MethodDeclaration ? K : never]: T[K] extends MethodDeclaration<
        infer InArgs,
        infer OutArgs
    >
        ? {
              in: InferParams<InArgs>
              out: OutArgs extends [] ? void : InferParams<OutArgs>
          }
        : never
}

export type Signals<T extends InterfaceDeclaration> = {
    [K in keyof T as T[K] extends SignalDeclaration ? K : never]: T[K] extends SignalDeclaration<
        infer Args
    >
        ? InferParams<Args>
        : never
}

export interface DBusGObject<T extends InterfaceDeclaration> extends GObject.Object {
    readonly $signals: GObject.Object.SignalSignatures & {
        [K in keyof Signals<T> as KebabCase<K>]: (...params: Signals<T>[K]) => void
    }
    readonly $readableProperties: {
        [K in keyof ReadableProperties<T> as KebabCase<K>]: T[K]
    }
    readonly $writableProperties: {
        [K in keyof WritableProperties<T> as KebabCase<K>]: T[K]
    }
}

export function inferGType(type: string): GObject.GType<any> {
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

export type InterfaceInfo<T extends InterfaceDeclaration> = Gio.DBusInterfaceInfo & {
    $declarations: T
}

export function createInterfaceInfo<T extends InterfaceDeclaration>(
    name: string,
    interfaceDeclaration: T,
) {
    const interfaceEntries = Object.entries(interfaceDeclaration).map(([name, decl]) =>
        decl.toXml(name),
    )

    const interfaceXml: XmlNode = {
        name: "interface",
        attributes: { name },
        children: interfaceEntries,
    }

    const nodeXml: XmlNode = {
        name: "node",
        children: [interfaceXml],
    }

    return Gio.DBusInterfaceInfo.new_for_xml(xml(nodeXml)) as InterfaceInfo<T>
}
