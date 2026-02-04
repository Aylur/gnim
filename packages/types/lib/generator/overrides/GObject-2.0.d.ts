const $type: unique symbol

type Keyof<T> = Extract<keyof T, string>

type SignalArgs<Signal> = Signal extends (...args: infer Args) => infer _
    ? Args
    : never

type Signals<Emitter> = Emitter extends { $signals: unknown }
    ? {
          [S in Keyof<Emitter["$signals"]> as S extends `${infer Name}::{}`
              ? Name
              : S]: Emitter["$signals"][S]
      }
    : never

type DetaliedSignals<Emitter> = Emitter extends { $signals: unknown }
    ? {
          [S in Keyof<Emitter["$signals"]> as S extends `${infer Name}::{}`
              ? Name extends "notify"
                  ? never
                  : Name
              : never]: Emitter["$signals"][S]
      }
    : never

type NotifySignals<Emitter> = Emitter extends {
    $readableProperties: unknown
    $signals: unknown
}
    ? {
          [P in Keyof<Emitter["$readableProperties"]> as `notify::${P}`]: (
              pspec: Emitter["$readableProperties"][P],
          ) => void
      }
    : never

type SignalHandlerOptions = {
    /**
     * Emissiont behavior
     * @default {GObject.SignalFlags.RUN_FIRST}
     */
    flags?: GObject.SignalFlags
    /**
     * List of GType arguments
     * @default {[]}
     */
    param_types?: readonly GObject.GType[]
    /**
     * List of GType arguments
     * @default {GObject.TYPE_NONE}
     */
    return_type?: GObject.GType
    /**
     * Return value behavior
     * @default {GObject.AccumulatorType.NONE}
     */
    accumulator?: GObject.AccumulatorType
}

type GObjectConstructor = { new (...args: any[]): GObject.Object }

type PascalCase<S> = S extends `${infer Head}${"-" | "_"}${infer Tail}`
    ? `${Capitalize<Head>}${PascalCase<Tail>}`
    : S extends string
      ? Capitalize<S>
      : never

type CamelCase<S> = S extends `${infer Head}${"-" | "_"}${infer Tail}`
    ? `${Lowercase<Head>}${PascalCase<Tail>}`
    : S extends string
      ? Lowercase<S>
      : never

/**
 * This is an object passed to a number of signal matching functions.
 */
interface SignalMatch {
    /**
     * A signal ID. Note that this is the signal ID, not a handler ID as returned from {@link GObject.Object.prototype.connect}.
     */
    signalId?: number
    /**
     * A signal detail, such as `prop` in `notify::prop`.
     */
    detail?: string
    /**
     * A signal callback function.
     */
    func?: Function
}

type PrimitiveConstructor<T, Input = unknown> = {
    $gtype: GObject.GType<T>
    (v: Input): T
}

namespace GObject {
    type GType<T = unknown> = {
        [$type]: T
        name: string
    }

    type ConstructorProps<Class> = Class extends {
        $readableProperties: unknown
        $constructOnlyProperties: unknown
    }
        ? {
              [K in Keyof<
                  Class["$readableProperties"] &
                      Class["$constructOnlyProperties"]
              > as CamelCase<K>]: (Class["$readableProperties"] &
                  Class["$constructOnlyProperties"])[K]
          }
        : never

    type SignalCallback<Emitter, Callback> = Callback extends (
        ...args: infer Args
    ) => infer Return
        ? (source: Emitter, ...args: Args) => Return
        : never

    interface ObjectClass {
        /**
         * This is the proper way to find the GType given an object instance or a class.
         * For a class, {@link GObject.type_from_name} can also be used.
         *
         * Note that the GType name for user-defined subclasses will be prefixed with
         * Gjs_ (i.e. Gjs_MyObject), unless the GTypeName class property is specified
         * when calling {@link GObject.registerClass}. Some applications, notably GNOME Shell,
         * may set {@link GObject.gtypeNameBasedOnJSPath} to true which changes the prefix
         * from Gjs_ to Gjs_<import path>.
         */
        readonly $gtype: GType<Object>

        "new"<T>(type: GType<T>, props: Record<string, unknown>): T

        new_with_properties<T>(
            type: GType<T>,
            names: string[],
            values: unknown[],
        ): T
    }

    interface Object {
        connect<Signal extends Keyof<DetaliedSignals<this>>>(
            signal: `${Signal}::${string}`,
            callback: SignalCallback<this, DetaliedSignals<this>[Signal]>,
        ): number

        connect<Signal extends Keyof<Signals<this>>>(
            signal: Signal,
            callback: SignalCallback<this, Signals<this>[Signal]>,
        ): number

        connect<Signal extends Keyof<NotifySignals<this>>>(
            signal: Signal,
            callback: SignalCallback<this, NotifySignals<this>[Signal]>,
        ): number

        connect_after<Signal extends Keyof<DetaliedSignals<this>>>(
            signal: `${Signal}::${string}`,
            callback: SignalCallback<this, DetaliedSignals<this>[Signal]>,
        ): number

        connect_after<Signal extends Keyof<Signals<this>>>(
            signal: Signal,
            callback: SignalCallback<this, Signals<this>[Signal]>,
        ): number

        connect_after<Signal extends Keyof<NotifySignals<this>>>(
            signal: Signal,
            callback: SignalCallback<this, NotifySignals<this>[Signal]>,
        ): number

        emit<Signal extends Keyof<DetaliedSignals<this>>>(
            signal: `${Signal}::${string}`,
            ...args: SignalArgs<DetaliedSignals<this>[Signal]>
        ): void

        emit<Signal extends Keyof<Signals<this>>>(
            signal: Signal,
            ...args: SignalArgs<Signals<this>[Signal]>
        ): void

        emit<Signal extends Keyof<NotifySignals<this>>>(
            signal: Signal,
            ...args: SignalArgs<NotifySignals<this>[Signal]>
        ): void

        disconnect(id: number): void

        notify<Property extends Keyof<this["$readableProperties"]>>(
            property: Property,
        ): void

        /**
         * Sets multiple properties of an object at once using `Object.assign`.
         * The properties argument should be a dictionary mapping property names to values.
         * ```js
         * object.set({ prop: "value"})
         * Object.assign(object, { props: "value" })
         * ```
         * @param properties Object containing the properties to set
         */
        set<T extends Array<keyof this>>(params: {
            [K in T[number]]: this[K]
        }): void

        /**
         * Blocks a handler of an instance so it will not be called during any signal emissions
         * @param id Handler ID of the handler to be blocked
         */
        block_signal_handler(id: number): void
        /**
         * Unblocks a handler so it will be called again during any signal emissions
         * @param id Handler ID of the handler to be unblocked
         */
        unblock_signal_handler(id: number): void
        /**
         * Stops a signal's emission by the given signal name.
         * This will prevent the default handler and any subsequent signal handlers from being invoked.
         * @param detailedName Name of the signal to stop emission of
         */
        stop_emission_by_name(detailedName: string): void
    }

    function registerClass<Class extends GObjectConstructor>(
        klass: Class,
    ): Class

    function registerClass<
        Class extends GObjectConstructor,
        Properties extends Record<string, ParamSpec>,
        Interfaces extends Array<{ readonly $gtype: GType }>,
        Signals extends Record<string, SignalHandlerOptions>,
    >(
        options: {
            GTypeName?: string
            GTypeFlags?: TypeFlags
            Requires?: Array<{ $gtype: GType }>
            Properties?: Properties
            Signals?: Signals
            Implements?: Interfaces
            CssName?: string
            Template?: string | GLib.Bytes | Uint8Array
            Children?: string[]
            InternalChildren?: string[]
        },
        klass: Class,
    ): Class

    /** @see {Object.$gtype} */
    let gtypeNameBasedOnJSPath: boolean

    const VoidType: PrimitiveConstructor<void>
    const TYPE_NONE: GType<void>

    const Char: PrimitiveConstructor<number>
    const TYPE_CHAR: GType<number>

    const UChar: PrimitiveConstructor<number>
    const TYPE_UCHAR: GType<number>

    // This is weird, GObject.type_from_name("gunichar") is `null`
    // and why does GJS map them to a gint and String?
    // const UniChar: PrimitiveConstructor<string>
    // const TYPE_UNICHAR: GType<number>
    const UniChar: PrimitiveConstructor<never>
    const TYPE_UNICHAR: GType<never>

    const Boolean: globalThis.BooleanConstructor
    const TYPE_BOOLEAN: GType<boolean>

    const Int: PrimitiveConstructor<number>
    const TYPE_INT: GType<number>

    const UInt: PrimitiveConstructor<number>
    const TYPE_UINT: GType<number>

    const Long: PrimitiveConstructor<number>
    const TYPE_LONG: GType<number>

    const ULong: PrimitiveConstructor<number>
    const TYPE_ULONG: GType<number>

    const Int64: PrimitiveConstructor<number>
    const TYPE_INT64: GType<number>

    const UInt64: PrimitiveConstructor<number>
    const TYPE_UINT64: GType<number>

    const TYPE_ENUM: GType<number>
    const TYPE_FLAGS: GType<number>

    const Float: PrimitiveConstructor<number>
    const TYPE_FLOAT: GType<number>

    const Double: globalThis.NumberConstructor
    const TYPE_DOUBLE: GType<number>

    const String: globalThis.StringConstructor
    const TYPE_STRING: GType<string>

    const JSObject: globalThis.ObjectConstructor
    const TYPE_JSOBJECT: GType<object>

    const TYPE_POINTER: GType<never>
    const TYPE_BOXED: GType<unknown>
    const TYPE_PARAM: GType<ParamSpec>
    const TYPE_INTERFACE: GType<unknown> // should this be GObject.Interface?
    const TYPE_OBJECT: GType<Object>
    const TYPE_VARIANT: GType<GLib.Variant>

    const Type: PrimitiveConstructor<GType, string>
    const TYPE_GTYPE: GType<GType>

    /**
     * A GObject parameter specification that defines property characteristics.
     * See [gjs.guide](https://gjs.guide/guides/gobject/basics.html#properties).
     */
    abstract class ParamSpec<T = unknown> {
        static $gtype: GType<ParamSpec>

        /**
         * Validate a property name for a `ParamSpec`. This can be useful for
         * dynamically-generated properties which need to be validated at run-time
         * before actually trying to create them.
         *
         * @param name the canonical name of the property
         */
        static is_valid_name(name: string): boolean
        /**
         * Creates a new GParamSpecChar instance specifying a G_TYPE_CHAR property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static char(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecUChar instance specifying a G_TYPE_UCHAR property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static uchar(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecInt instance specifying a G_TYPE_INT property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static int(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecUInt instance specifying a G_TYPE_UINT property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static uint(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecLong instance specifying a G_TYPE_LONG property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static long(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecULong instance specifying a G_TYPE_ULONG property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static ulong(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecInt64 instance specifying a G_TYPE_INT64 property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static int64(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecUInt64 instance specifying a G_TYPE_UINT64 property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static uint64(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecFloat instance specifying a G_TYPE_FLOAT property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static float(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecBoolean instance specifying a G_TYPE_BOOLEAN property. In many cases, it may be more appropriate to use an enum with g_param_spec_enum(), both to improve code clarity by using explicitly named values, and to allow for more values to be added in future without breaking API.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param defaultValue The default value for this property (optional)
         */
        static boolean(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            defaultValue?: boolean,
        ): ParamSpec<boolean>
        /**
         * Creates a new GParamSpecEnum instance specifying a G_TYPE_ENUM property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param enumType The GType for this property
         * @param defaultValue The default value for this property (optional)
         */
        static enum<T>(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            enumType: GType<T> | { $gtype: GType<T> },
            defaultValue?: any,
        ): ParamSpec<T>
        /**
         * Creates a new GParamSpecDouble instance specifying a G_TYPE_DOUBLE property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param minimum The minimum value for this property
         * @param maximum The maximum value for this property
         * @param defaultValue The default value for this property (optional)
         */
        static double(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            minimum: number,
            maximum: number,
            defaultValue?: number,
        ): ParamSpec<number>
        /**
         * Creates a new GParamSpecString instance specifying a G_TYPE_STRING property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param defaultValue The default value for this property (optional, defaults to null if not provided)
         */
        static string(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            defaultValue?: string | null,
        ): ParamSpec<string>
        /**
         * Creates a new GParamSpecBoxed instance specifying a G_TYPE_BOXED derived property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param boxedType The GType for this property
         */
        static boxed<T>(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            boxedType: GType<T> | { $gtype: GType<T> },
        ): ParamSpec<T>
        /**
         * Creates a new GParamSpecObject instance specifying a property holding object references.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param objectType The GType of the object (optional)
         */
        static object<T>(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            objectType?: GType<T> | { $gtype: GType<T> },
        ): ParamSpec<T>
        /**
         * Creates a new GParamSpecParam instance specifying a G_TYPE_PARAM property.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         * @param paramType The GType for this property
         */
        static param(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
            paramType: any,
        ): ParamSpec
        /**
         * Creates a new ParamSpec instance for JavaScript object properties.
         * @param name The name of the property
         * @param nick A human readable name for the property (can be null)
         * @param blurb A longer description of the property (can be null)
         * @param flags The flags for this property (e.g. READABLE, WRITABLE)
         */
        static jsobject<T>(
            name: string,
            nick: string | null,
            blurb: string | null,
            flags: ParamFlags,
        ): ParamSpec<T>

        name: string
        nick: string
        blurb: string
        default_value: T
        flags: ParamFlags
        value_type: GType
        owner_type: GType

        /**
         * Get the short description of a `GParamSpec`.
         * @returns the short description of @pspec.
         */
        get_blurb(): string | null
        /**
         * Gets the default value of `pspec` as a pointer to a `GValue`.
         *
         * The `GValue` will remain valid for the life of `pspec`.
         * @returns a pointer to a `GValue` which must not be modified
         */
        get_default_value(): unknown
        /**
         * Get the name of a `GParamSpec`.
         *
         * The name is always an "interned" string (as per g_intern_string()).
         * This allows for pointer-value comparisons.
         * @returns the name of @pspec.
         */
        get_name(): string
        /**
         * Gets the GQuark for the name.
         * @returns the GQuark for @pspec->name.
         */
        get_name_quark(): GLib.Quark
        /**
         * Get the nickname of a `GParamSpec`.
         * @returns the nickname of @pspec.
         */
        get_nick(): string
        /**
         * If the paramspec redirects operations to another paramspec,
         * returns that paramspec. Redirect is used typically for
         * providing a new implementation of a property in a derived
         * type while preserving all the properties from the parent
         * type. Redirection is established by creating a property
         * of type `GParamSpecOverride`. See g_object_class_override_property()
         * for an example of the use of this capability.
         * @returns paramspec to which requests on this          paramspec should be redirected, or %NULL if none.
         */
        get_redirect_target(): ParamSpec | null
        /**
         * The initial reference count of a newly created `GParamSpec` is 1,
         * even though no one has explicitly called g_param_spec_ref() on it
         * yet. So the initial reference count is flagged as "floating", until
         * someone calls `g_param_spec_ref (pspec); g_param_spec_sink
         * (pspec);` in sequence on it, taking over the initial
         * reference count (thus ending up with a `pspec` that has a reference
         * count of 1 still, but is not flagged "floating" anymore).
         */
        sink(): void
        /**
         * Registers a property override for a property introduced in a parent class or inherited interface.
         * @param name The name of the property to override
         * @param oclass The object class or type that contains the property to override
         */
        override(name: string, oclass: Object | Function | GType): void
    }

    export class Interface<T = unknown> extends Object {
        // TODO: come up with an API
    }

    /**
     * Use this to signify a function that must be overridden in an
     * implementation of the interface.
     */
    class NotImplementedError extends globalThis.Error {
        get name(): "NotImplementedError"
    }

    const GTypeName: unique symbol
    const requires: unique symbol
    const interfaces: unique symbol
    const properties: unique symbol
    const signals: unique symbol

    /**
     * Signal accumulation behavior.
     * See {@link GObject.registerClass} and {@link SignalHandlerOptions}
     */
    enum AccumulatorType {
        /**
         * This is the default.
         */
        NONE,
        /**
         * This accumulator will use the return value of the first handler that is run.
         * A signal with this accumulator may have a return of any type.
         */
        FIRST_WINS,
        /**
         * This accumulator will stop emitting once a handler returns `true`.
         * A signal with this accumulator must have a return type of `GObject.TYPE_BOOLEAN`.
         */
        TRUE_HANDLED,
    }

    /**
     * Finds the first signal handler that matches certain selection criteria.
     * The criteria are passed as properties of a match object.
     * The match object has to be non-empty for successful matches.
     * If no handler was found, a falsy value is returned.
     *
     * @param instance the instance owning the signal handler to be found.
     * @param match a properties object indicating whether to match by signal ID, detail, or callback function.
     * @returns A valid non-0 signal handler ID for a successful match.
     */
    function signal_handler_find(
        instance: Object,
        match: SignalMatch,
    ): number | bigint | object | null

    /**
     * Blocks all handlers on an instance that match certain selection criteria.
     * The criteria are passed as properties of a match object.
     * The match object has to have at least `func` for successful matches.
     * If no handlers were found, 0 is returned, the number of blocked handlers
     * otherwise.
     *
     * @param instance the instance owning the signal handler to be found.
     * @param match a properties object indicating whether to match by signal ID, detail, or callback function.
     * @returns The number of handlers that matched.
     */
    function signal_handlers_block_matched(
        instance: Object,
        match: SignalMatch,
    ): number

    /**
     * Unblocks all handlers on an instance that match certain selection
     * criteria.
     * The criteria are passed as properties of a match object.
     * The match object has to have at least `func` for successful matches.
     * If no handlers were found, 0 is returned, the number of unblocked
     * handlers otherwise.
     * The match criteria should not apply to any handlers that are not
     * currently blocked.
     *
     * @param instance the instance owning the signal handler to be found.
     * @param match a properties object indicating whether to match by signal ID, detail, or callback function.
     * @returns The number of handlers that matched.
     */
    function signal_handlers_unblock_matched(
        instance: Object,
        match: SignalMatch,
    ): number

    /**
     * Disconnects all handlers on an instance that match certain selection
     * criteria.
     * The criteria are passed as properties of a match object.
     * The match object has to have at least `func` for successful matches.
     * If no handlers were found, 0 is returned, the number of disconnected
     * handlers otherwise.
     *
     * @param instance the instance owning the signal handler to be found.
     * @param match a properties object indicating whether to match by signal ID, detail, or callback function.
     * @returns The number of handlers that matched.
     */
    function signal_handlers_disconnect_matched(
        instance: Object,
        match: SignalMatch,
    ): number

    /**
     * Blocks all handlers on an instance that match `func`.
     *
     * @param instance the instance to block handlers from.
     * @param func the callback function the handler will invoke.
     * @returns The number of handlers that matched.
     */
    function signal_handlers_block_by_func(
        instance: Object,
        func: Function,
    ): number

    /**
     * Disconnects all handlers on an instance that match `func`.
     *
     * @param instance the instance to remove handlers from.
     * @param func the callback function the handler will invoke.
     * @returns The number of handlers that matched.
     */
    function signal_handlers_disconnect_by_func(
        instance: Object,
        func: Function,
    ): number

    function type_is_a<T extends Object>(
        obj: Object,
        is_a_type: T | GType<T>,
    ): obj is T

    /** @see Object.connect */
    function signal_connect<T extends Object>(
        object: T,
        name: string,
        handler: (source: T, ...args: unknown[]) => unknown,
    ): number

    /** @see Object.connect_after */
    function signal_connect_after<T extends Object>(
        object: T,
        name: string,
        handler: (source: T, ...args: unknown[]) => unknown,
    ): number

    /** @see Object.emit */
    function signal_emit_by_name<T extends Object>(
        object: T,
        ...args: unknown[]
    ): unknown

    /**
     * A generic value container, usually only used to implement GObject Properties
     * in projects written with the C programming language. By storing the value
     * type alongside the value, it allows for dynamic type features usually
     * not available to C programmers.
     *
     * In JavaScript, this behavior is part of the language (i.e. `typeof`) and GJS
     * will usually convert them automatically, but there are some situations
     * that require using `GObject.Value` directly.
     */
    class Value<T = any> {
        static readonly $gtype: GObject.GType<Value>

        constructor()

        constructor(
            type: GObject.GType<T> | { $gtype: GObject.GType<T> },
            value: T,
        )

        /**
         * Returns whether a `Value` of type `src_type` can be copied into
         * a `Value` of type `dest_type`.
         * @param src_type source type to be copied.
         * @param dest_type destination type for copying.
         * @returns `true` if g_value_copy() is possible with `src_type` and `dest_type`.
         */
        static type_compatible(
            src_type: GObject.GType | { $gtype: GObject.GType },
            dest_type: GObject.GType | { $gtype: GObject.GType },
        ): boolean
        /**
         * Check whether g_value_transform() is able to transform values
         * of type `src_type` into values of type `dest_type`. Note that for
         * the types to be transformable, they must be compatible or a
         * transformation function must be registered.
         * @param src_type Source type.
         * @param dest_type Target type.
         * @returns `true` if the transformation is possible, `false` otherwise.
         */
        static type_transformable(
            src_type: GObject.GType | { $gtype: GObject.GType },
            dest_type: GObject.GType | { $gtype: GObject.GType },
        ): boolean

        /**
         * Copies the value of `src_value` into `dest_value`.
         * @param dest_value An initialized `GValue` structure of the same type as `src_value`.
         */
        copy(dest_value: Value<T>): void
        /**
         * @returns boolean contents of `this`
         */
        get_boolean(): T extends boolean ? T : never
        /**
         * @returns boxed contents of `this`
         */
        get_boxed(): null
        /**
         * @returns double contents of `this`
         */
        get_double(): T extends number ? T : never
        /**
         * @returns enum contents of `this`
         */
        get_enum(): T extends number ? T : never
        /**
         * @returns flags contents of `this`
         */
        get_flags(): T extends number ? T : never
        /**
         * @returns float contents of `this`
         */
        get_float(): T extends number ? T : never
        /**
         * @since 2.12
         * @returns the `GType` stored in `this`
         */
        get_gtype(): T extends GObject.GType ? T : never
        /**
         * @returns integer contents of `this`
         */
        get_int(): T extends number ? T : never
        /**
         * @returns 64bit integer contents of `this`
         */
        get_int64(): T extends number ? T : never
        /**
         * @returns long integer contents of `this`
         */
        get_long(): T extends number ? T : never
        /**
         * @returns object contents of `this`
         */
        get_object(): T extends Object ? T : never
        /**
         * Get the contents of a %G_TYPE_PARAM `GValue`.
         * @returns `GParamSpec` content of `this`
         */
        get_param(): T extends ParamSpec ? T : never
        /**
         * @since 2.32
         * @returns signed 8 bit integer contents of `this`
         */
        get_schar(): T extends number ? T : never
        /**
         * @returns string content of `this`
         */
        get_string(): (T extends string ? T : never) | null
        /**
         * @returns unsigned character contents of `this`
         */
        get_uchar(): T extends number ? T : never
        /**
         * @returns unsigned integer contents of `this`
         */
        get_uint(): T extends number ? T : never
        /**
         * @returns unsigned 64bit integer contents of `this`
         */
        get_uint64(): T extends number ? T : never
        /**
         * @returns unsigned long integer contents of `this`
         */
        get_ulong(): T extends number ? T : never
        /**
         * @since 2.26
         * @returns variant contents of `this` (may be `null`)
         */
        get_variant(): T extends GLib.Variant ? T | null : never
        /**
         * @param g_type Type the `this` should hold values of.
         * @deprecated since GJS 1.84: use `new Value(type, value)`
         */
        init<T>(g_type: GObject.GType<T> | { $gtype: GObject.GType<T> }): void
        /**
         * Clears the current value in `this` and resets it to the default value
         * (as if the value had just been initialized).
         */
        reset(): this
        /**
         * @param v_boolean boolean value to be set
         */
        set_boolean(v_boolean: T extends boolean ? T : never): void
        /**
         * @param v_boxed boxed value to be set
         */
        set_boxed(v_boxed: never | null): void
        /**
         * @param v_double double value to be set
         */
        set_double(v_double: T extends number ? T : never): void
        /**
         * @param v_enum enum value to be set
         */
        set_enum(v_enum: T extends number ? T : never): void
        /**
         * @param v_flags flags value to be set
         */
        set_flags(v_flags: T extends number ? T : never): void
        /**
         * @param v_float float value to be set
         */
        set_float(v_float: T extends number ? T : never): void
        /**
         * @since 2.12
         * @param v_gtype `GType` to be set
         */
        set_gtype(v_gtype: GObject.GType | { $gtype: GObject.GType }): void
        /**
         * @param v_int integer value to be set
         */
        set_int(v_int: T extends number ? T : never): void
        /**
         * @param v_int64 64bit integer value to be set
         */
        set_int64(v_int64: T extends number ? T : never): void
        /**
         * @param v_long long integer value to be set
         */
        set_long(v_long: T extends number ? T : never): void
        /**
         * @param v_object object value to be set
         */
        set_object(v_object: T extends Object ? T | null : never): void
        /**
         * @param param the `GParamSpec` to be set
         */
        set_param(param: T extends ParamSpec ? T | null : never): void
        /**
         * @since 2.32
         * @param v_char signed 8 bit integer to be set
         */
        set_schar(v_char: T extends number ? T : never): void
        /**
         * @param v_string caller-owned string to be duplicated for the `GValue`
         */
        set_string(v_string: T extends string ? T | null : never): void
        /**
         * @param v_uchar unsigned character value to be set
         */
        set_uchar(v_uchar: T extends number ? T : never): void
        /**
         * @param v_uint unsigned integer value to be set
         */
        set_uint(v_uint: T extends number ? T : never): void
        /**
         * @param v_uint64 unsigned 64bit integer value to be set
         */
        set_uint64(v_uint64: T extends number ? T : never): void
        /**
         * @param v_ulong unsigned long integer value to be set
         */
        set_ulong(v_ulong: T extends number ? T : never): void
        /**
         * @since 2.26
         * @param variant a `GVariant`, or `null`
         */
        set_variant(variant: T extends GLib.Variant ? T | null : never): void
        /**
         * Tries to cast the contents of `src_value` into a type appropriate
         * to store in `dest_value`, e.g. to transform a %G_TYPE_INT value
         * into a %G_TYPE_FLOAT value. Performing transformations between
         * value types might incur precision lossage. Especially
         * transformations into strings might reveal seemingly arbitrary
         * results and shouldn't be relied upon for production code (such
         * as rcfile value or object property serialization).
         * @param dest_value Target value.
         * @returns Whether a transformation rule was found and could be applied.  Upon failing transformations, `dest_value` is left untouched.
         */
        transform(dest_value: Value): boolean
        /**
         * Clears the current value in `this` (if any) and "unsets" the type,
         * this releases all resources associated with this GValue. An unset
         * value is the same as an uninitialized (zero-filled) GValue
         * structure.
         */
        unset(): void
    }
}
