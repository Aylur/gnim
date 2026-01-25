type Variant<S extends string = any> = GLib.Variant<S>

// prettier-ignore
type CreateIndexType<Key extends string, Value> =
    Key extends `s` | `o` | `g` ? { [key: string]: Value } :
    Key extends `n` | `q` | `t` | `d` | `u` | `i` | `x` | `y` ? { [key: number]: Value } : never

type VariantTypeError<T extends string> = { error: true } & T

/**
 * Handles the {kv} of a{kv} where k is a basic type and v is any possible variant type string.
 */
// prettier-ignore
type $ParseDeepVariantDict<State extends string, Memo extends Record<string, any> = {}> =
    string extends State
    ? VariantTypeError<"$ParseDeepVariantDict: 'string' is not a supported type.">
    // Hitting the first '}' indicates the dictionary type is complete
    : State extends `}${infer State}`
    ? [Memo, State]
    // This separates the key (basic type) from the rest of the remaining expression.
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseDeepVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [CreateIndexType<Key, Value>, State]
    : VariantTypeError<`$ParseDeepVariantDict encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseDeepVariantValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseDeepVariantDict encountered an invalid variant string: ${State} (2)`>

/**
 * Handles parsing values within a tuple (e.g. (vvv)) where v is any possible variant type string.
 */
// prettier-ignore
type $ParseDeepVariantArray<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseDeepVariantArray: 'string' is not a supported type.">
    : State extends `)${infer State}`
    ? [Memo, State]
    : $ParseDeepVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `${infer _NextValue})${infer _NextState}`
    ? $ParseDeepVariantArray<State, [...Memo, Value]>
    : State extends `)${infer State}`
    ? [[...Memo, Value], State]
    : VariantTypeError<`1: $ParseDeepVariantArray encountered an invalid variant string: ${State}`>
    : VariantTypeError<`2: $ParseDeepVariantValue returned unexpected value for: ${State}`>

/**
 * Handles parsing {kv} without an 'a' prefix (key-value pair) where k is a basic type
 * and v is any possible variant type string.
 */
// prettier-ignore
type $ParseDeepVariantKeyValue<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseDeepVariantKeyValue: 'string' is not a supported type.">
    : State extends `}${infer State}`
    ? [Memo, State]
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseDeepVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [[...Memo, $ParseVariant<Key>, Value], State]
    : VariantTypeError<`$ParseDeepVariantKeyValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseDeepVariantKeyValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseDeepVariantKeyValue encountered an invalid variant string: ${State} (2)`>

/**
 * Handles parsing any variant 'value' or base unit.
 *
 * - ay - Array of bytes (Uint8Array)
 * - a* - Array of type *
 * - a{k*} - Dictionary
 * - {k*} - KeyValue
 * - (**) - tuple
 * - s | o | g - string types
 * - n | q | t | d | u | i | x | y - number types
 * - b - boolean type
 * - v - unknown Variant type
 * - h | ? - unknown types
 */
// prettier-ignore
type $ParseDeepVariantValue<State extends string> =
    string extends State
    ? unknown
    : State extends `${`s` | `o` | `g`}${infer State}`
    ? [string, State]
    : State extends `${`n` | `q` | `t` | `d` | `u` | `i` | `x` | `y`}${infer State}`
    ? [number, State]
    : State extends `b${infer State}`
    ? [boolean, State]
    : State extends `v${infer State}`
    ? [Variant, State]
    : State extends `${'h' | '?'}${infer State}`
    ? [unknown, State]
    : State extends `(${infer State}`
    ? $ParseDeepVariantArray<State>
    : State extends `a{${infer State}`
    ? $ParseDeepVariantDict<State>
    : State extends `{${infer State}`
    ? $ParseDeepVariantKeyValue<State>
    : State extends `ay${infer State}` ?
    [Uint8Array, State]
    : State extends `m${infer State}`
    ? $ParseDeepVariantValue<State> extends [infer Value, `${infer State}`]
        ? [Value | null, State]
        : VariantTypeError<`$ParseDeepVariantValue encountered an invalid variant string: ${State} (3)`>
    : State extends `a${infer State}` ?
    $ParseDeepVariantValue<State> extends [infer Value, `${infer State}`] ?
    [Value[], State]
    : VariantTypeError<`$ParseDeepVariantValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseDeepVariantValue encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseDeepVariant<T extends string> =
    $ParseDeepVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : VariantTypeError<"$ParseDeepVariantValue returned unexpected Result">
    : VariantTypeError<"$ParseDeepVariantValue returned uninferrable Result">

// prettier-ignore
type $ParseRecursiveVariantDict<State extends string, Memo extends Record<string, any> = {}> =
    string extends State
    ? VariantTypeError<"$ParseRecursiveVariantDict: 'string' is not a supported type.">
    : State extends `}${infer State}`
    ? [Memo, State]
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseRecursiveVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [CreateIndexType<Key, Value>, State]
    : VariantTypeError<`$ParseRecursiveVariantDict encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseRecursiveVariantValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseRecursiveVariantDict encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseRecursiveVariantArray<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseRecursiveVariantArray: 'string' is not a supported type.">
    : State extends `)${infer State}`
    ? [Memo, State]
    : $ParseRecursiveVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `${infer _NextValue})${infer _NextState}`
    ? $ParseRecursiveVariantArray<State, [...Memo, Value]>
    : State extends `)${infer State}`
    ? [[...Memo, Value], State]
    : VariantTypeError<`$ParseRecursiveVariantArray encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseRecursiveVariantValue returned unexpected value for: ${State} (2)`>

// prettier-ignore
type $ParseRecursiveVariantKeyValue<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseRecursiveVariantKeyValue: 'string' is not a supported type.">
    : State extends `}${infer State}`
    ? [Memo, State]
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseRecursiveVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [[...Memo, Key, Value], State]
    : VariantTypeError<`$ParseRecursiveVariantKeyValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseRecursiveVariantKeyValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseRecursiveVariantKeyValue encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseRecursiveVariantValue<State extends string> =
    string extends State
    ? unknown
    : State extends `${`s` | `o` | `g`}${infer State}`
    ? [string, State]
    : State extends `${`n` | `q` | `t` | `d` | `u` | `i` | `x` | `y`}${infer State}`
    ? [number, State]
    : State extends `b${infer State}`
    ? [boolean, State]
    : State extends `v${infer State}`
    ? [unknown, State]
    : State extends `${'h' | '?'}${infer State}`
    ? [unknown, State]
    : State extends `(${infer State}`
    ? $ParseRecursiveVariantArray<State>
    : State extends `a{${infer State}`
    ? $ParseRecursiveVariantDict<State>
    : State extends `{${infer State}`
    ? $ParseRecursiveVariantKeyValue<State>
    : State extends `ay${infer State}` ?
    [Uint8Array, State]
    : State extends `m${infer State}`
    ? $ParseRecursiveVariantValue<State> extends [infer Value, `${infer State}`]
        ? [Value | null, State]
        : VariantTypeError<`$ParseRecursiveVariantValue encountered an invalid variant string: ${State} (3)`>
    : State extends `a${infer State}` ?
    $ParseRecursiveVariantValue<State> extends [infer Value, `${infer State}`] ?
    [Value[], State]
    : VariantTypeError<`$ParseRecursiveVariantValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseRecursiveVariantValue encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseRecursiveVariant<T extends string> =
    $ParseRecursiveVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : never
    : never

// prettier-ignore
type $ParseVariantDict<State extends string, Memo extends Record<string, any> = {}> =
    string extends State
    ? VariantTypeError<"$ParseVariantDict: 'string' is not a supported type.">
    : State extends `}${infer State}`
    ? [Memo, State]
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [CreateIndexType<Key, Variant<Value extends string ? Value : any>>, State]
    : VariantTypeError<`$ParseVariantDict encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseVariantValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseVariantDict encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseVariantArray<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseVariantArray: 'string' is not a supported type.">
    : State extends `)${infer State}`
    ? [Memo, State]
    : $ParseVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `${infer _NextValue})${infer _NextState}`
    ? $ParseVariantArray<State, [...Memo, Variant<Value extends string ? Value : any>]>
    : State extends `)${infer State}`
    ? [[...Memo, Variant<Value extends string ? Value : any>], State]
    : VariantTypeError<`$ParseVariantArray encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseVariantValue returned unexpected value for: ${State} (2)`>

// prettier-ignore
type $ParseVariantKeyValue<State extends string, Memo extends any[] = []> =
    string extends State
    ? VariantTypeError<"$ParseVariantKeyValue: 'string' is not a supported type.">
    : State extends `}${infer State}`
    ? [Memo, State]
    : State extends `${infer Key}${''}${infer State}`
    ? $ParseVariantValue<State> extends [infer Value, `${infer State}`]
    ? State extends `}${infer State}`
    ? [[...Memo, Variant<Key>, Variant<Value extends string ? Value: any>], State]
    : VariantTypeError<`$ParseVariantKeyValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseVariantKeyValue returned unexpected value for: ${State}`>
    : VariantTypeError<`$ParseVariantKeyValue encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseShallowRootVariantValue<State extends string> =
    string extends State
    ? unknown
    : State extends `${`s` | `o` | `g`}${infer State}`
    ? [string, State]
    : State extends `${`n` | `q` | `t` | `d` | `u` | `i` | `x` | `y`}${infer State}`
    ? [number, State]
    : State extends `b${infer State}`
    ? [boolean, State]
    : State extends `v${infer State}`
    ? [Variant, State]
    : State extends `h${infer State}`
    ? [unknown, State]
    : State extends `?${infer State}`
    ? [unknown, State]
    : State extends `(${infer State}`
    ? $ParseVariantArray<State>
    : State extends `a{${infer State}`
    ? $ParseVariantDict<State>
    : State extends `{${infer State}`
    ? $ParseVariantKeyValue<State>
    : State extends `ay${infer State}` ?
    [Uint8Array, State]
    : State extends `m${infer State}`
    ? $ParseVariantValue<State> extends [infer Value, `${infer State}`]
        ? [Value | null, State]
        : VariantTypeError<`$ParseShallowRootVariantValue encountered an invalid variant string: ${State} (2)`>
    : State extends `a${infer State}` ?
    [Variant<State>[], State]
    : VariantTypeError<`$ParseShallowRootVariantValue encountered an invalid variant string: ${State} (1)`>

// prettier-ignore
type $ParseVariantValue<State extends string> =
    string extends State
    ? unknown
    : State extends `s${infer State}`
    ? ['s', State]
    : State extends `o${infer State}`
    ? ['o', State]
    : State extends `g${infer State}`
    ? ['g', State]
    : State extends `n${infer State}`
    ? ["n", State]
    : State extends `q${infer State}`
    ? ["q", State]
    : State extends `t${infer State}`
    ? ["t", State]
    : State extends `d${infer State}`
    ? ["d", State]
    : State extends `u${infer State}`
    ? ["u", State]
    : State extends `i${infer State}`
    ? ["i", State]
    : State extends `x${infer State}`
    ? ["x", State]
    : State extends `y${infer State}`
    ? ["y", State]
    : State extends `b${infer State}`
    ? ['b', State]
    : State extends `v${infer State}`
    ? ['v', State]
    : State extends `h${infer State}`
    ? ['h', State]
    : State extends `?${infer State}`
    ? ['?', State]
    : State extends `(${infer State}`
    ? $ParseVariantArray<State>
    : State extends `a{${infer State}`
    ? $ParseVariantDict<State>
    : State extends `{${infer State}`
    ? $ParseVariantKeyValue<State>
    : State extends `ay${infer State}` ?
    [Uint8Array, State]
    : State extends `m${infer State}`
    ? $ParseVariantValue<State> extends [infer Value, `${infer State}`]
        ? [Value | null, State]
        : VariantTypeError<`$ParseVariantValue encountered an invalid variant string: ${State} (3)`>
    : State extends `a${infer State}` ?
    $ParseVariantValue<State> extends [infer Value, `${infer State}`] ?
    [Value[], State]
    : VariantTypeError<`$ParseVariantValue encountered an invalid variant string: ${State} (1)`>
    : VariantTypeError<`$ParseVariantValue encountered an invalid variant string: ${State} (2)`>

// prettier-ignore
type $ParseVariant<T extends string> =
    $ParseShallowRootVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : never
    : never

type Infer<S extends string> = $ParseVariant<S>
type DeepInfer<S extends string> = $ParseDeepVariant<S>
type RecursiveInfer<S extends string> = $ParseRecursiveVariant<S>

namespace GLib {
    interface MainLoop {
        /**
         * Similar to {@link GLib.MainLoop.run} but return a `Promise` which resolves when the main loop ends, instead of blocking while the main loop runs.
         * This helps avoid the situation where Promises never resolved if you didn't run the application inside a callback.
         */
        runAsync(): Promise<void>
    }

    const MAXINT64_BIGINT: bigint
    const MININT64_BIGINT: bigint
    const MAXUINT64_BIGINT: bigint

    /**
     * Log a message with structured data.
     * For more information about this function, see the upstream documentation for [g_log_structured](https://docs.gtk.org/glib/func.log_structured.html).
     *
     * @param logDomain A log domain, usually G_LOG_DOMAINA
     * @param logLevel A log level, either from {@link LogLevelFlags}, or a user-defined level
     * @param stringFields Key–value pairs of structured data to add to the log message
     */
    function log_structured(
        logDomain: string,
        logLevel: LogLevelFlags,
        stringFields: Record<string, any>,
    ): void

    function idle_add_once(priority: number, callback: () => void): number

    function timeout_add_once(
        priority: number,
        interval: number,
        callback: () => void,
    ): number

    function timeout_add_seconds_once(
        priority: number,
        interval: number,
        callback: () => void,
    ): number

    interface Bytes {
        /**
         * Convert a {@link GLib.Bytes} object to a `Uint8Array` object.
         */
        toArray(): Uint8Array
    }

    /**
     * An opaque structure used to hold different types of values.
     *
     * The data within the structure has protected scope: it is accessible only
     * to functions within a #GTypeValueTable structure, or implementations of
     * the g_value_*() API. That is, code portions which implement new fundamental
     * types.
     *
     * #GValue users cannot make any assumptions about how data is stored
     * within the 2 element `data` union, and the `g_type` member should
     * only be accessed through the G_VALUE_TYPE() macro.
     */
    // TODO:
    class Value<T = unknown> {
        static readonly $gtype: GObject.GType<Value>
        /**
         * Returns whether a #GValue of type `src_type` can be copied into
         * a #GValue of type `dest_type`.
         * @param src_type source type to be copied.
         * @param dest_type destination type for copying.
         * @returns %TRUE if g_value_copy() is possible with `src_type` and `dest_type`.
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
         * @returns %TRUE if the transformation is possible, %FALSE otherwise.
         */
        static type_transformable(
            src_type: GObject.GType | { $gtype: GObject.GType },
            dest_type: GObject.GType | { $gtype: GObject.GType },
        ): boolean

        data: never[]
        /**
         * Copies the value of `src_value` into `dest_value`.
         * @param dest_value An initialized #GValue structure of the same type as `src_value`.
         */
        copy(dest_value: Value): void
        /**
         * Get the contents of a %G_TYPE_OBJECT derived #GValue, increasing
         * its reference count. If the contents of the #GValue are %NULL, then
         * %NULL will be returned.
         * @returns object content of `value`,          should be unreferenced when no longer needed.
         */
        dup_object(): Object | null
        /**
         * Get a copy the contents of a %G_TYPE_STRING #GValue.
         * @returns a newly allocated copy of the string content of `value`
         */
        dup_string(): string | null
        /**
         * Get the contents of a variant #GValue, increasing its refcount. The returned
         * #GVariant is never floating.
         * @since 2.26
         * @returns variant contents of `value` (may be %NULL);    should be unreffed using g_variant_unref() when no longer needed
         */
        dup_variant(): GLib.Variant | null
        /**
         * Determines if `value` will fit inside the size of a pointer value.
         * This is an internal function introduced mainly for C marshallers.
         * @returns %TRUE if `value` will fit inside a pointer value.
         */
        fits_pointer(): boolean
        /**
         * Get the contents of a %G_TYPE_BOOLEAN #GValue.
         * @returns boolean contents of `value`
         */
        get_boolean(): boolean
        /**
         * Get the contents of a %G_TYPE_BOXED derived #GValue.
         * @returns boxed contents of `value`
         */
        get_boxed(): never | null
        /**
         * Do not use this function; it is broken on platforms where the %char
         * type is unsigned, such as ARM and PowerPC.  See g_value_get_schar().
         *
         * Get the contents of a %G_TYPE_CHAR #GValue.
         * @deprecated since 2.32 This function's return type is broken, see g_value_get_schar()
         * @returns character contents of `value`
         */
        get_char(): number
        /**
         * Get the contents of a %G_TYPE_DOUBLE #GValue.
         * @returns double contents of `value`
         */
        get_double(): number
        /**
         * Get the contents of a %G_TYPE_ENUM #GValue.
         * @returns enum contents of `value`
         */
        get_enum(): number
        /**
         * Get the contents of a %G_TYPE_FLAGS #GValue.
         * @returns flags contents of `value`
         */
        get_flags(): number
        /**
         * Get the contents of a %G_TYPE_FLOAT #GValue.
         * @returns float contents of `value`
         */
        get_float(): number
        /**
         * Get the contents of a %G_TYPE_GTYPE #GValue.
         * @since 2.12
         * @returns the #GType stored in `value`
         */
        get_gtype(): GObject.GType
        /**
         * Get the contents of a %G_TYPE_INT #GValue.
         * @returns integer contents of `value`
         */
        get_int(): number
        /**
         * Get the contents of a %G_TYPE_INT64 #GValue.
         * @returns 64bit integer contents of `value`
         */
        get_int64(): number
        /**
         * Get the contents of a %G_TYPE_LONG #GValue.
         * @returns long integer contents of `value`
         */
        get_long(): number
        /**
         * Get the contents of a %G_TYPE_OBJECT derived #GValue.
         * @returns object contents of `value`
         */
        get_object(): Object | null
        /**
         * Get the contents of a %G_TYPE_PARAM #GValue.
         * @returns #GParamSpec content of `value`
         */
        get_param(): ParamSpec
        /**
         * Get the contents of a pointer #GValue.
         * @returns pointer contents of `value`
         */
        get_pointer(): never | null
        /**
         * Get the contents of a %G_TYPE_CHAR #GValue.
         * @since 2.32
         * @returns signed 8 bit integer contents of `value`
         */
        get_schar(): number
        /**
         * Get the contents of a %G_TYPE_STRING #GValue.
         * @returns string content of `value`
         */
        get_string(): string | null
        /**
         * Get the contents of a %G_TYPE_UCHAR #GValue.
         * @returns unsigned character contents of `value`
         */
        get_uchar(): number
        /**
         * Get the contents of a %G_TYPE_UINT #GValue.
         * @returns unsigned integer contents of `value`
         */
        get_uint(): number
        /**
         * Get the contents of a %G_TYPE_UINT64 #GValue.
         * @returns unsigned 64bit integer contents of `value`
         */
        get_uint64(): number
        /**
         * Get the contents of a %G_TYPE_ULONG #GValue.
         * @returns unsigned long integer contents of `value`
         */
        get_ulong(): number
        /**
         * Get the contents of a variant #GValue.
         * @since 2.26
         * @returns variant contents of `value` (may be %NULL)
         */
        get_variant(): GLib.Variant | null
        /**
         * Initializes `value` with the default value of `type`.
         * @param g_type Type the #GValue should hold values of.
         * @returns the #GValue structure that has been passed in
         */
        init(g_type: GObject.GType | { $gtype: GObject.GType }): Value
        /**
         * Initializes and sets `value` from an instantiatable type via the
         * value_table's collect_value() function.
         *
         * Note: The `value` will be initialised with the exact type of
         *  `instance`.  If you wish to set the `value`'s type to a different GType
         * (such as a parent class GType), you need to manually call
         * g_value_init() and g_value_set_instance().
         * @since 2.42
         * @param instance the instance
         */
        init_from_instance(instance: TypeInstance): void
        /**
         * Returns the value contents as pointer. This function asserts that
         * g_value_fits_pointer() returned %TRUE for the passed in value.
         * This is an internal function introduced mainly for C marshallers.
         * @returns the value contents as pointer
         */
        peek_pointer(): never | null
        /**
         * Clears the current value in `value` and resets it to the default value
         * (as if the value had just been initialized).
         * @returns the #GValue structure that has been passed in
         */
        reset(): Value
        /**
         * Set the contents of a %G_TYPE_BOOLEAN #GValue to `v_boolean`.
         * @param v_boolean boolean value to be set
         */
        set_boolean(v_boolean: boolean): void
        /**
         * Set the contents of a %G_TYPE_BOXED derived #GValue to `v_boxed`.
         * @param v_boxed boxed value to be set
         */
        set_boxed(v_boxed: never | null): void
        /**
         * This is an internal function introduced mainly for C marshallers.
         * @deprecated since 2.4 Use g_value_take_boxed() instead.
         * @param v_boxed duplicated unowned boxed value to be set
         */
        set_boxed_take_ownership(v_boxed: never | null): void
        /**
         * Set the contents of a %G_TYPE_CHAR #GValue to `v_char`.
         * @deprecated since 2.32 This function's input type is broken, see g_value_set_schar()
         * @param v_char character value to be set
         */
        set_char(v_char: number): void
        /**
         * Set the contents of a %G_TYPE_DOUBLE #GValue to `v_double`.
         * @param v_double double value to be set
         */
        set_double(v_double: number): void
        /**
         * Set the contents of a %G_TYPE_ENUM #GValue to `v_enum`.
         * @param v_enum enum value to be set
         */
        set_enum(v_enum: number): void
        /**
         * Set the contents of a %G_TYPE_FLAGS #GValue to `v_flags`.
         * @param v_flags flags value to be set
         */
        set_flags(v_flags: number): void
        /**
         * Set the contents of a %G_TYPE_FLOAT #GValue to `v_float`.
         * @param v_float float value to be set
         */
        set_float(v_float: number): void
        /**
         * Set the contents of a %G_TYPE_GTYPE #GValue to `v_gtype`.
         * @since 2.12
         * @param v_gtype #GType to be set
         */
        set_gtype(v_gtype: GObject.GType | { $gtype: GObject.GType }): void
        /**
         * Sets `value` from an instantiatable type via the
         * value_table's collect_value() function.
         * @param instance the instance
         */
        set_instance(instance: never | null): void
        /**
         * Set the contents of a %G_TYPE_INT #GValue to `v_int`.
         * @param v_int integer value to be set
         */
        set_int(v_int: number): void
        /**
         * Set the contents of a %G_TYPE_INT64 #GValue to `v_int64`.
         * @param v_int64 64bit integer value to be set
         */
        set_int64(v_int64: number): void
        /**
         * Set the contents of a %G_TYPE_STRING #GValue to `v_string`.  The string is
         * assumed to be static and interned (canonical, for example from
         * g_intern_string()), and is thus not duplicated when setting the #GValue.
         * @since 2.66
         * @param v_string static string to be set
         */
        set_interned_string(v_string: string | null): void
        /**
         * Set the contents of a %G_TYPE_LONG #GValue to `v_long`.
         * @param v_long long integer value to be set
         */
        set_long(v_long: number): void
        /**
         * Set the contents of a %G_TYPE_OBJECT derived #GValue to `v_object`.
         *
         * g_value_set_object() increases the reference count of `v_object`
         * (the #GValue holds a reference to `v_object`).  If you do not wish
         * to increase the reference count of the object (i.e. you wish to
         * pass your current reference to the #GValue because you no longer
         * need it), use g_value_take_object() instead.
         *
         * It is important that your #GValue holds a reference to `v_object` (either its
         * own, or one it has taken) to ensure that the object won't be destroyed while
         * the #GValue still exists).
         * @param v_object object value to be set
         */
        set_object(v_object: Object | null): void
        /**
         * Set the contents of a %G_TYPE_PARAM #GValue to `param`.
         * @param param the #GParamSpec to be set
         */
        set_param(param: ParamSpec | null): void
        /**
         * Set the contents of a pointer #GValue to `v_pointer`.
         * @param v_pointer pointer value to be set
         */
        set_pointer(v_pointer: never | null): void
        /**
         * Set the contents of a %G_TYPE_CHAR #GValue to `v_char`.
         * @since 2.32
         * @param v_char signed 8 bit integer to be set
         */
        set_schar(v_char: number): void
        /**
         * Set the contents of a %G_TYPE_BOXED derived #GValue to `v_boxed`.
         *
         * The boxed value is assumed to be static, and is thus not duplicated
         * when setting the #GValue.
         * @param v_boxed static boxed value to be set
         */
        set_static_boxed(v_boxed: never | null): void
        /**
         * Set the contents of a %G_TYPE_STRING #GValue to `v_string`.
         * The string is assumed to be static, and is thus not duplicated
         * when setting the #GValue.
         *
         * If the the string is a canonical string, using g_value_set_interned_string()
         * is more appropriate.
         * @param v_string static string to be set
         */
        set_static_string(v_string: string | null): void
        /**
         * Set the contents of a %G_TYPE_STRING #GValue to a copy of `v_string`.
         * @param v_string caller-owned string to be duplicated for the #GValue
         */
        set_string(v_string: string | null): void
        /**
         * This is an internal function introduced mainly for C marshallers.
         * @deprecated since 2.4 Use g_value_take_string() instead.
         * @param v_string duplicated unowned string to be set
         */
        set_string_take_ownership(v_string: string | null): void
        /**
         * Set the contents of a %G_TYPE_UCHAR #GValue to `v_uchar`.
         * @param v_uchar unsigned character value to be set
         */
        set_uchar(v_uchar: number): void
        /**
         * Set the contents of a %G_TYPE_UINT #GValue to `v_uint`.
         * @param v_uint unsigned integer value to be set
         */
        set_uint(v_uint: number): void
        /**
         * Set the contents of a %G_TYPE_UINT64 #GValue to `v_uint64`.
         * @param v_uint64 unsigned 64bit integer value to be set
         */
        set_uint64(v_uint64: number): void
        /**
         * Set the contents of a %G_TYPE_ULONG #GValue to `v_ulong`.
         * @param v_ulong unsigned long integer value to be set
         */
        set_ulong(v_ulong: number): void
        /**
         * Set the contents of a variant #GValue to `variant`.
         * If the variant is floating, it is consumed.
         * @since 2.26
         * @param variant a #GVariant, or %NULL
         */
        set_variant(variant: GLib.Variant | null): void
        /**
         * Steal ownership on contents of a %G_TYPE_STRING #GValue.
         * As a result of this operation the value's contents will be reset to %NULL.
         *
         * The purpose of this call is to provide a way to avoid an extra copy
         * when some object have been serialized into string through #GValue API.
         *
         * NOTE: for safety and compatibility purposes, if #GValue contains
         * static string, or an interned one, this function will return a copy
         * of the string. Otherwise the transfer notation would be ambiguous.
         * @since 2.80
         * @returns string content of `value`;  Should be freed with g_free() when no longer needed.
         */
        steal_string(): string | null
        /**
         * Sets the contents of a %G_TYPE_BOXED derived #GValue to `v_boxed`
         * and takes over the ownership of the caller’s reference to `v_boxed`;
         * the caller doesn’t have to unref it any more.
         * @since 2.4
         * @param v_boxed duplicated unowned boxed value to be set
         */
        take_boxed(v_boxed: never | null): void
        /**
         * Sets the contents of a %G_TYPE_STRING #GValue to `v_string`.
         * @since 2.4
         * @param v_string string to take ownership of
         */
        take_string(v_string: string | null): void
        /**
         * Set the contents of a variant #GValue to `variant`, and takes over
         * the ownership of the caller's reference to `variant`;
         * the caller doesn't have to unref it any more (i.e. the reference
         * count of the variant is not increased).
         *
         * If `variant` was floating then its floating reference is converted to
         * a hard reference.
         *
         * If you want the #GValue to hold its own reference to `variant`, use
         * g_value_set_variant() instead.
         *
         * This is an internal function introduced mainly for C marshallers.
         * @since 2.26
         * @param variant a #GVariant, or %NULL
         */
        take_variant(variant: GLib.Variant | null): void
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
         * Clears the current value in `value` (if any) and "unsets" the type,
         * this releases all resources associated with this GValue. An unset
         * value is the same as an uninitialized (zero-filled) #GValue
         * structure.
         */
        unset(): void
    }
}
