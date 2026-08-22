import GObject from "gi://GObject?version=2.0"

export const { Object } = GObject
export type Object = GObject.Object
export type ConstructorProps<Class> = GObject.ConstructorProps<Class>

export namespace Object {
    export type SignalSignatures = GObject.Object.SignalSignatures
    export type ReadableProperties = GObject.Object.ReadableProperties
    export type WritableProperties = GObject.Object.WritableProperties
    export type ConstructOnlyProperties = GObject.Object.ConstructOnlyProperties
}

export const { SignalFlags } = GObject
export type SignalFlags = GObject.SignalFlags

export const { AccumulatorType } = GObject
export type AccumulatorType = GObject.AccumulatorType

export const { ParamSpec } = GObject
export type ParamSpec<T = unknown> = GObject.ParamSpec<T>

export const { ParamFlags } = GObject
export type ParamFlags = GObject.ParamFlags

export type GType<T = unknown> = GObject.GType<T>

export const {
    VoidType,
    Char,
    UChar,
    Boolean,
    Int,
    UInt,
    Long,
    ULong,
    Int64,
    UInt64,
    Float,
    Double,
    String,
    JSObject,
    Type,
} = GObject
