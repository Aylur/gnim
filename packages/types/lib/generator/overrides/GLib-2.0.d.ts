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

// prettier-ignore
type $VariantTypeToString<T extends VariantType> = T extends VariantType<infer S> ? S : never

// prettier-ignore
type $ToTuple<T extends readonly VariantType[]> =
    T extends [] ? '' :
    T extends [VariantType<infer S>] ? `${S}` :
    T extends [VariantType<infer S>, ...infer U] ? (
        U extends [...VariantType[]] ? `${S}${$ToTuple<U>}` : never) :
    '?'

// prettier-ignore
type $ElementSig<E> =
    E extends [infer Element] ? Element :
    E extends [infer Element, ...infer Elements] ? Element | $ElementSig<Elements> :
    E extends globalThis.Array<infer Element> ? Element : never

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
     * GLib.Variant is a value container whose types are determined at construction.
     *
     * It serves as a reliable and efficient format for storing structured data that can be
     * serialized while preserving type information. Comparable to JSON, but with strong typing
     * and support for special values like file handles.
     *
     * GVariant is used throughout the GNOME Platform including GDBus, GSettings, GAction,
     * GMenu and many other APIs.
     *
     * @example
     * ```typescript
     * // Create variants using constructor with type signature
     * const stringVariant = new GLib.Variant('s', 'Hello World');
     * const numberVariant = new GLib.Variant('i', 42);
     * const boolVariant = new GLib.Variant('b', true);
     *
     * // Create complex variants like dictionaries
     * const dictVariant = new GLib.Variant('a{sv}', {
     *   'name': GLib.Variant.new_string('Gnome'),
     *   'active': GLib.Variant.new_boolean(true)
     * });
     *
     * // Unpack variants to JavaScript values
     * stringVariant.unpack(); // → "Hello World"
     * dictVariant.deepUnpack(); // → { name: Variant<"s">, active: Variant<"b"> }
     * dictVariant.recursiveUnpack(); // → { name: "Gnome", active: true }
     * ```
     *
     * @see {@link https://gjs.guide/guides/glib/gvariant.html|GJS Guide: GVariant}
     * @see {@link https://docs.gtk.org/glib/struct.Variant.html|GLib Documentation: GVariant}
     */
    class Variant<S extends string = any> {
        static readonly $gtype: GObject.GType<Variant>

        /**
         * Creates a new GVariant with the specified type signature and value.
         *
         * @param sig The GVariant type signature
         * @param value The JavaScript value to pack into the variant
         * @example
         * ```typescript
         * const variant = new GLib.Variant('s', 'Hello');
         * const arrayVariant = new GLib.Variant('as', ['one', 'two', 'three']);
         * ```
         */
        constructor(sig: S, value: $ParseDeepVariant<S>)
        constructor(copy: Variant<S>)

        /**
         * Creates a new GVariant with the specified type signature and value.
         *
         * @param sig The GVariant type signature
         * @param value The JavaScript value to pack into the variant
         * @example
         * ```typescript
         * const variant = GLib.Variant.new('s', 'Hello');
         * const arrayVariant = GLib.Variant.new('as', ['one', 'two', 'three']);
         * ```
         */
        static new<S extends string>(
            sig: S,
            value: $ParseDeepVariant<S>,
        ): Variant<S>

        /**
         * Creates a new #GVariant array from `children`.
         *
         *  `child_type` must be non-%NULL if `n_children` is zero.  Otherwise, the
         * child type is determined by inspecting the first element of the
         *  `children` array.  If `child_type` is non-%NULL then it must be a
         * definite type.
         *
         * The items of the array are taken from the `children` array.  No entry
         * in the `children` array may be %NULL.
         *
         * All items in the array must have the same type, which must be the
         * same as `child_type`, if given.
         *
         * If the `children` are floating references (see g_variant_ref_sink()), the
         * new instance takes ownership of them as if via g_variant_ref_sink().
         * @since 2.24
         * @param child_type the element type of the new array
         * @param children an array of            #GVariant pointers, the children
         * @returns a floating reference to a new #GVariant array
         */
        static new_array<C extends string = "a?">(
            child_type: VariantType<C> | null,
            children: typeof child_type extends VariantType<any>
                ? Variant<$VariantTypeToString<typeof child_type>>[]
                : Variant<C>[],
        ): Variant<`a${C}`>

        /**
         * Creates a new boolean #GVariant instance -- either %TRUE or %FALSE.
         * @since 2.24
         * @param value a #gboolean value
         * @returns a floating reference to a new boolean #GVariant instance
         */
        static new_boolean(value: boolean): Variant<"b">
        /**
         * Creates a new byte #GVariant instance.
         * @since 2.24
         * @param value a #guint8 value
         * @returns a floating reference to a new byte #GVariant instance
         */
        static new_byte(value: number): Variant<"y">
        /**
         * Creates an array-of-bytes #GVariant with the contents of `string`.
         * This function is just like g_variant_new_string() except that the
         * string need not be valid UTF-8.
         *
         * The nul terminator character at the end of the string is stored in
         * the array.
         * @since 2.26
         * @param string a normal          nul-terminated string in no particular encoding
         * @returns a floating reference to a new bytestring #GVariant instance
         */
        static new_bytestring(string: Uint8Array | string): Variant<"ay">
        /**
         * Constructs an array of bytestring #GVariant from the given array of
         * strings.
         *
         * If `length` is -1 then `strv` is %NULL-terminated.
         * @since 2.26
         * @param strv an array of strings
         * @returns a new floating #GVariant instance
         */
        static new_bytestring_array(strv: string[]): Variant<"aay">
        /**
         * Creates a new dictionary entry #GVariant. `key` and `value` must be
         * non-%NULL. `key` must be a value of a basic type (ie: not a container).
         *
         * If the `key` or `value` are floating references (see g_variant_ref_sink()),
         * the new instance takes ownership of them as if via g_variant_ref_sink().
         * @since 2.24
         * @param key a basic #GVariant, the key
         * @param value a #GVariant, the value
         * @returns a floating reference to a new dictionary entry #GVariant
         */
        static new_dict_entry(key: Variant, value: Variant): Variant<"{vv}">
        /**
         * Creates a new double #GVariant instance.
         * @since 2.24
         * @param value a #gdouble floating point value
         * @returns a floating reference to a new double #GVariant instance
         */
        static new_double(value: number): Variant<"d">
        /**
         * Constructs a new array #GVariant instance, where the elements are
         * of `element_type` type.
         *
         *  `elements` must be an array with fixed-sized elements.  Numeric types are
         * fixed-size as are tuples containing only other fixed-sized types.
         *
         *  `element_size` must be the size of a single element in the array.
         * For example, if calling this function for an array of 32-bit integers,
         * you might say sizeof(gint32). This value isn't used except for the purpose
         * of a double-check that the form of the serialized data matches the caller's
         * expectation.
         *
         *  `n_elements` must be the length of the `elements` array.
         * @since 2.32
         * @param element_type the #GVariantType of each element
         * @param elements a pointer to the fixed array of contiguous elements
         * @param n_elements the number of elements
         * @param element_size the size of each element
         * @returns a floating reference to a new array #GVariant instance
         */
        static new_fixed_array<C extends string = "a?">(
            element_type: VariantType<C>,
            elements:
                | Variant<$VariantTypeToString<typeof element_type>>[]
                | null,
            n_elements: number,
            element_size: number,
        ): Variant<`a${C}`>
        /**
         * Constructs a new serialized-mode #GVariant instance.  This is the
         * inner interface for creation of new serialized values that gets
         * called from various functions in gvariant.c.
         *
         * A reference is taken on `bytes`.
         *
         * The data in `bytes` must be aligned appropriately for the `type` being loaded.
         * Otherwise this function will internally create a copy of the memory (since
         * GLib 2.60) or (in older versions) fail and exit the process.
         * @since 2.36
         * @param type a #GVariantType
         * @param bytes a #GBytes
         * @param trusted if the contents of `bytes` are trusted
         * @returns a new #GVariant with a floating reference
         */
        static new_from_bytes<C extends string>(
            type: VariantType<C>,
            bytes: Bytes | Uint8Array,
            trusted: boolean,
        ): Variant<C>
        /**
         * Creates a new #GVariant instance from serialized data.
         *
         *  `type` is the type of #GVariant instance that will be constructed.
         * The interpretation of `data` depends on knowing the type.
         *
         *  `data` is not modified by this function and must remain valid with an
         * unchanging value until such a time as `notify` is called with
         *  `user_data`.  If the contents of `data` change before that time then
         * the result is undefined.
         *
         * If `data` is trusted to be serialized data in normal form then
         *  `trusted` should be %TRUE.  This applies to serialized data created
         * within this process or read from a trusted location on the disk (such
         * as a file installed in /usr/lib alongside your application).  You
         * should set trusted to %FALSE if `data` is read from the network, a
         * file in the user's home directory, etc.
         *
         * If `data` was not stored in this machine's native endianness, any multi-byte
         * numeric values in the returned variant will also be in non-native
         * endianness. g_variant_byteswap() can be used to recover the original values.
         *
         *  `notify` will be called with `user_data` when `data` is no longer
         * needed.  The exact time of this call is unspecified and might even be
         * before this function returns.
         *
         * Note: `data` must be backed by memory that is aligned appropriately for the
         *  `type` being loaded. Otherwise this function will internally create a copy of
         * the memory (since GLib 2.60) or (in older versions) fail and exit the
         * process.
         * @since 2.24
         * @param type a definite #GVariantType
         * @param data the serialized data
         * @param trusted %TRUE if `data` is definitely in normal form
         * @param notify function to call when `data` is no longer needed
         * @param user_data data for `notify`
         * @returns a new floating #GVariant of type `type`
         */
        static new_from_data<C extends string>(
            type: VariantType<C>,
            data: Uint8Array | string,
            trusted: boolean,
            user_data: null,
        ): Variant<C>
        /**
         * Creates a new handle #GVariant instance.
         *
         * By convention, handles are indexes into an array of file descriptors
         * that are sent alongside a D-Bus message.  If you're not interacting
         * with D-Bus, you probably don't need them.
         * @since 2.24
         * @param value a #gint32 value
         * @returns a floating reference to a new handle #GVariant instance
         */
        static new_handle(value: number): Variant<"h">
        /**
         * Creates a new int16 #GVariant instance.
         * @since 2.24
         * @param value a #gint16 value
         * @returns a floating reference to a new int16 #GVariant instance
         */
        static new_int16(value: number): Variant<"n">
        /**
         * Creates a new int32 #GVariant instance.
         * @since 2.24
         * @param value a #gint32 value
         * @returns a floating reference to a new int32 #GVariant instance
         */
        static new_int32(value: number): Variant<"i">
        /**
         * Creates a new int64 #GVariant instance.
         * @since 2.24
         * @param value a #gint64 value
         * @returns a floating reference to a new int64 #GVariant instance
         */
        static new_int64(value: number): Variant<"x">
        /**
         * Depending on if `child` is %NULL, either wraps `child` inside of a
         * maybe container or creates a Nothing instance for the given `type`.
         *
         * At least one of `child_type` and `child` must be non-%NULL.
         * If `child_type` is non-%NULL then it must be a definite type.
         * If they are both non-%NULL then `child_type` must be the type
         * of `child`.
         *
         * If `child` is a floating reference (see g_variant_ref_sink()), the new
         * instance takes ownership of `child`.
         * @since 2.24
         * @param child_type the #GVariantType of the child, or %NULL
         * @param child the child value, or %NULL
         * @returns a floating reference to a new #GVariant maybe instance
         */
        static new_maybe(
            child_type: VariantType | null,
            child: Variant | null,
        ): Variant<"mv">
        /**
         * Creates a D-Bus object path #GVariant with the contents of `object_path`.
         *  `object_path` must be a valid D-Bus object path.  Use
         * g_variant_is_object_path() if you're not sure.
         * @since 2.24
         * @param object_path a normal C nul-terminated string
         * @returns a floating reference to a new object path #GVariant instance
         */
        static new_object_path(object_path: string): Variant<"o">
        /**
         * Constructs an array of object paths #GVariant from the given array of
         * strings.
         *
         * Each string must be a valid #GVariant object path; see
         * g_variant_is_object_path().
         *
         * If `length` is -1 then `strv` is %NULL-terminated.
         * @since 2.30
         * @param strv an array of strings
         * @returns a new floating #GVariant instance
         */
        static new_objv(strv: string[]): Variant<"ao">
        /**
         * Creates a D-Bus type signature #GVariant with the contents of
         *  `string`.  `string` must be a valid D-Bus type signature.  Use
         * g_variant_is_signature() if you're not sure.
         * @since 2.24
         * @param signature a normal C nul-terminated string
         * @returns a floating reference to a new signature #GVariant instance
         */
        static new_signature(signature: string): Variant<"g">
        /**
         * Creates a string #GVariant with the contents of `string`.
         *
         *  `string` must be valid UTF-8, and must not be %NULL. To encode
         * potentially-%NULL strings, use g_variant_new() with `ms` as the
         * [format string](gvariant-format-strings.html#maybe-types).
         * @since 2.24
         * @param string a normal UTF-8 nul-terminated string
         * @returns a floating reference to a new string #GVariant instance
         */
        static new_string(string: string): Variant<"s">
        /**
         * Constructs an array of strings #GVariant from the given array of
         * strings.
         *
         * If `length` is -1 then `strv` is %NULL-terminated.
         * @since 2.24
         * @param strv an array of strings
         * @returns a new floating #GVariant instance
         */
        static new_strv(strv: string[]): Variant<"as">
        /**
         * Creates a new tuple #GVariant out of the items in `children`.  The
         * type is determined from the types of `children`.  No entry in the
         *  `children` array may be %NULL.
         *
         * If `n_children` is 0 then the unit tuple is constructed.
         *
         * If the `children` are floating references (see g_variant_ref_sink()), the
         * new instance takes ownership of them as if via g_variant_ref_sink().
         * @since 2.24
         * @param children the items to make the tuple out of
         * @returns a floating reference to a new #GVariant tuple
         */
        static new_tuple<
            Items extends ReadonlyArray<VariantType> | readonly [VariantType],
        >(children: Items): Variant<`(${$ToTuple<Items>})`>
        /**
         * Creates a new uint16 #GVariant instance.
         * @since 2.24
         * @param value a #guint16 value
         * @returns a floating reference to a new uint16 #GVariant instance
         */
        static new_uint16(value: number): Variant<"q">
        /**
         * Creates a new uint32 #GVariant instance.
         * @since 2.24
         * @param value a #guint32 value
         * @returns a floating reference to a new uint32 #GVariant instance
         */
        static new_uint32(value: number): Variant<"u">
        /**
         * Creates a new uint64 #GVariant instance.
         * @since 2.24
         * @param value a #guint64 value
         * @returns a floating reference to a new uint64 #GVariant instance
         */
        static new_uint64(value: number): Variant<"t">
        /**
         * Boxes `value`.  The result is a #GVariant instance representing a
         * variant containing the original value.
         *
         * If `child` is a floating reference (see g_variant_ref_sink()), the new
         * instance takes ownership of `child`.
         * @since 2.24
         * @param value a #GVariant instance
         * @returns a floating reference to a new variant #GVariant instance
         */
        static new_variant(value: Variant): Variant<"v">
        /**
         * Determines if a given string is a valid D-Bus object path.  You
         * should ensure that a string is a valid D-Bus object path before
         * passing it to g_variant_new_object_path().
         *
         * A valid object path starts with `/` followed by zero or more
         * sequences of characters separated by `/` characters.  Each sequence
         * must contain only the characters `[A-Z][a-z][0-9]_`.  No sequence
         * (including the one following the final `/` character) may be empty.
         * @since 2.24
         * @param string a normal C nul-terminated string
         * @returns %TRUE if `string` is a D-Bus object path
         */
        static is_object_path(string: string): boolean
        /**
         * Determines if a given string is a valid D-Bus type signature.  You
         * should ensure that a string is a valid D-Bus type signature before
         * passing it to g_variant_new_signature().
         *
         * D-Bus type signatures consist of zero or more definite #GVariantType
         * strings in sequence.
         * @since 2.24
         * @param string a normal C nul-terminated string
         * @returns %TRUE if `string` is a D-Bus type signature
         */
        static is_signature(string: string): boolean
        /**
         * Parses a #GVariant from a text representation.
         *
         * A single #GVariant is parsed from the content of `text`.
         *
         * The format is described [here](gvariant-text-format.html).
         *
         * The memory at `limit` will never be accessed and the parser behaves as
         * if the character at `limit` is the nul terminator.  This has the
         * effect of bounding `text`.
         *
         * If `endptr` is non-%NULL then `text` is permitted to contain data
         * following the value that this function parses and `endptr` will be
         * updated to point to the first character past the end of the text
         * parsed by this function.  If `endptr` is %NULL and there is extra data
         * then an error is returned.
         *
         * If `type` is non-%NULL then the value will be parsed to have that
         * type.  This may result in additional parse errors (in the case that
         * the parsed value doesn't fit the type) but may also result in fewer
         * errors (in the case that the type would have been ambiguous, such as
         * with empty arrays).
         *
         * In the event that the parsing is successful, the resulting #GVariant
         * is returned. It is never floating, and must be freed with
         * [method@GLib.Variant.unref].
         *
         * In case of any error, %NULL will be returned.  If `error` is non-%NULL
         * then it will be set to reflect the error that occurred.
         *
         * Officially, the language understood by the parser is “any string
         * produced by [method@GLib.Variant.print]”. This explicitly includes
         * `g_variant_print()`’s annotated types like `int64 -1000`.
         *
         * There may be implementation specific restrictions on deeply nested values,
         * which would result in a %G_VARIANT_PARSE_ERROR_RECURSION error. #GVariant is
         * guaranteed to handle nesting up to at least 64 levels.
         * @throws {GLib.Error}
         * @param type a #GVariantType, or %NULL
         * @param text a string containing a GVariant in text form
         * @param limit a pointer to the end of `text`, or %NULL
         * @param endptr a location to store the end pointer, or %NULL
         * @returns a non-floating reference to a #GVariant, or %NULL
         */
        static parse(
            type: VariantType | null,
            text: string,
            limit: string | null,
            endptr: string | null,
        ): Variant
        /**
         * Pretty-prints a message showing the context of a #GVariant parse
         * error within the string for which parsing was attempted.
         *
         * The resulting string is suitable for output to the console or other
         * monospace media where newlines are treated in the usual way.
         *
         * The message will typically look something like one of the following:
         *
         * |[
         * unterminated string constant:
         *   (1, 2, 3, 'abc
         *             ^^^^
         * ]|
         *
         * or
         *
         * |[
         * unable to find a common type:
         *   [1, 2, 3, 'str']
         *    ^        ^^^^^
         * ]|
         *
         * The format of the message may change in a future version.
         *
         *  `error` must have come from a failed attempt to g_variant_parse() and
         *  `source_str` must be exactly the same string that caused the error.
         * If `source_str` was not nul-terminated when you passed it to
         * g_variant_parse() then you must add nul termination before using this
         * function.
         * @since 2.40
         * @param error a #GError from the #GVariantParseError domain
         * @param source_str the string that was given to the parser
         * @returns the printed message
         */
        static parse_error_print_context(
            error: Error,
            source_str: string,
        ): string

        static parse_error_quark(): Quark
        /**
         * Same as g_variant_error_quark().
         * @deprecated Use g_variant_parse_error_quark() instead.
         */
        static parser_get_error_quark(): Quark
        /**
         * Performs a byteswapping operation on the contents of `value`.  The
         * result is that all multi-byte numeric data contained in `value` is
         * byteswapped.  That includes 16, 32, and 64bit signed and unsigned
         * integers as well as file handles and double precision floating point
         * values.
         *
         * This function is an identity mapping on any value that does not
         * contain multi-byte numeric data.  That include strings, booleans,
         * bytes and containers containing only these things (recursively).
         *
         * While this function can safely handle untrusted, non-normal data, it is
         * recommended to check whether the input is in normal form beforehand, using
         * g_variant_is_normal_form(), and to reject non-normal inputs if your
         * application can be strict about what inputs it rejects.
         *
         * The returned value is always in normal form and is marked as trusted.
         * A full, not floating, reference is returned.
         * @since 2.24
         * @returns the byteswapped form of `value`
         */
        byteswap(): Variant
        /**
         * Checks if calling g_variant_get() with `format_string` on `value` would
         * be valid from a type-compatibility standpoint.  `format_string` is
         * assumed to be a valid format string (from a syntactic standpoint).
         *
         * If `copy_only` is %TRUE then this function additionally checks that it
         * would be safe to call g_variant_unref() on `value` immediately after
         * the call to g_variant_get() without invalidating the result.  This is
         * only possible if deep copies are made (ie: there are no pointers to
         * the data inside of the soon-to-be-freed #GVariant instance).  If this
         * check fails then a g_critical() is printed and %FALSE is returned.
         *
         * This function is meant to be used by functions that wish to provide
         * varargs accessors to #GVariant values of uncertain values (eg:
         * g_variant_lookup() or g_menu_model_get_item_attribute()).
         * @since 2.34
         * @param format_string a valid #GVariant format string
         * @param copy_only %TRUE to ensure the format string makes deep copies
         * @returns %TRUE if `format_string` is safe to use
         */
        check_format_string(format_string: string, copy_only: boolean): boolean
        /**
         * Classifies `value` according to its top-level type.
         * @since 2.24
         * @returns the #GVariantClass of `value`
         */
        classify(): VariantClass
        /**
         * Compares `one` and `two`.
         *
         * The types of `one` and `two` are #gconstpointer only to allow use of
         * this function with #GTree, #GPtrArray, etc.  They must each be a
         * #GVariant.
         *
         * Comparison is only defined for basic types (ie: booleans, numbers,
         * strings).  For booleans, %FALSE is less than %TRUE.  Numbers are
         * ordered in the usual way.  Strings are in ASCII lexographical order.
         *
         * It is a programmer error to attempt to compare container values or
         * two values that have types that are not exactly equal.  For example,
         * you cannot compare a 32-bit signed integer with a 32-bit unsigned
         * integer.  Also note that this function is not particularly
         * well-behaved when it comes to comparison of doubles; in particular,
         * the handling of incomparable values (ie: NaN) is undefined.
         *
         * If you only require an equality comparison, g_variant_equal() is more
         * general.
         * @since 2.26
         * @param two a #GVariant instance of the same type
         * @returns negative value if a < b;          zero if a = b;          positive value if a > b.
         */
        compare(two: Variant): number
        /**
         * Similar to g_variant_get_bytestring() except that instead of
         * returning a constant string, the string is duplicated.
         *
         * The return value must be freed using g_free().
         * @since 2.26
         * @returns           a newly allocated string, a pointer to a #gsize, to store          the length (not including the nul terminator)
         */
        dup_bytestring(): Uint8Array
        /**
         * Gets the contents of an array of array of bytes #GVariant.  This call
         * makes a deep copy; the return result should be released with
         * g_strfreev().
         *
         * If `length` is non-%NULL then the number of elements in the result is
         * stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.26
         * @returns an array of strings, the length of the result, or %NULL
         */
        dup_bytestring_array(): string[]
        /**
         * Gets the contents of an array of object paths #GVariant.  This call
         * makes a deep copy; the return result should be released with
         * g_strfreev().
         *
         * If `length` is non-%NULL then the number of elements in the result
         * is stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.30
         * @returns an array of strings, the length of the result, or %NULL
         */
        dup_objv(): string[]
        /**
         * Similar to g_variant_get_string() except that instead of returning
         * a constant string, the string is duplicated.
         *
         * The string will always be UTF-8 encoded.
         *
         * The return value must be freed using g_free().
         * @since 2.24
         * @returns a newly allocated string, UTF-8 encoded, a pointer to a #gsize, to store the length
         */
        dup_string(): [string, number]
        /**
         * Gets the contents of an array of strings #GVariant.  This call
         * makes a deep copy; the return result should be released with
         * g_strfreev().
         *
         * If `length` is non-%NULL then the number of elements in the result
         * is stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.24
         * @returns an array of strings, the length of the result, or %NULL
         */
        dup_strv(): string[]
        /**
         * Checks if `one` and `two` have the same type and value.
         *
         * The types of `one` and `two` are #gconstpointer only to allow use of
         * this function with #GHashTable.  They must each be a #GVariant.
         * @since 2.24
         * @param two a #GVariant instance
         * @returns %TRUE if `one` and `two` are equal
         */
        equal(two: Variant): boolean
        /**
         * Returns the boolean value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_BOOLEAN.
         * @since 2.24
         * @returns %TRUE or %FALSE
         */
        get_boolean(): boolean
        /**
         * Returns the byte value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_BYTE.
         * @since 2.24
         * @returns a #guint8
         */
        get_byte(): number
        /**
         * Returns the string value of a #GVariant instance with an
         * array-of-bytes type.  The string has no particular encoding.
         *
         * If the array does not end with a nul terminator character, the empty
         * string is returned.  For this reason, you can always trust that a
         * non-%NULL nul-terminated string will be returned by this function.
         *
         * If the array contains a nul terminator character somewhere other than
         * the last byte then the returned string is the string, up to the first
         * such nul character.
         *
         * g_variant_get_fixed_array() should be used instead if the array contains
         * arbitrary data that could not be nul-terminated or could contain nul bytes.
         *
         * It is an error to call this function with a `value` that is not an
         * array of bytes.
         *
         * The return value remains valid as long as `value` exists.
         * @since 2.26
         * @returns           the constant string
         */
        get_bytestring(): Uint8Array
        /**
         * Gets the contents of an array of array of bytes #GVariant.  This call
         * makes a shallow copy; the return result should be released with
         * g_free(), but the individual strings must not be modified.
         *
         * If `length` is non-%NULL then the number of elements in the result is
         * stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.26
         * @returns an array of constant strings, the length of the result, or %NULL
         */
        get_bytestring_array(): string[]
        /**
         * Reads a child item out of a container #GVariant instance.  This
         * includes variants, maybes, arrays, tuples and dictionary
         * entries.  It is an error to call this function on any other type of
         * #GVariant.
         *
         * It is an error if `index_` is greater than the number of child items
         * in the container.  See g_variant_n_children().
         *
         * The returned value is never floating.  You should free it with
         * g_variant_unref() when you're done with it.
         *
         * Note that values borrowed from the returned child are not guaranteed to
         * still be valid after the child is freed even if you still hold a reference
         * to `value`, if `value` has not been serialized at the time this function is
         * called. To avoid this, you can serialize `value` by calling
         * g_variant_get_data() and optionally ignoring the return value.
         *
         * There may be implementation specific restrictions on deeply nested values,
         * which would result in the unit tuple being returned as the child value,
         * instead of further nested children. #GVariant is guaranteed to handle
         * nesting up to at least 64 levels.
         *
         * This function is O(1).
         * @since 2.24
         * @param index_ the index of the child to fetch
         * @returns the child at the specified index
         */
        get_child_value(index_: number): Variant
        /**
         * Returns a pointer to the serialized form of a #GVariant instance.
         * The returned data may not be in fully-normalised form if read from an
         * untrusted source.  The returned data must not be freed; it remains
         * valid for as long as `value` exists.
         *
         * If `value` is a fixed-sized value that was deserialized from a
         * corrupted serialized container then %NULL may be returned.  In this
         * case, the proper thing to do is typically to use the appropriate
         * number of nul bytes in place of `value`.  If `value` is not fixed-sized
         * then %NULL is never returned.
         *
         * In the case that `value` is already in serialized form, this function
         * is O(1).  If the value is not already in serialized form,
         * serialization occurs implicitly and is approximately O(n) in the size
         * of the result.
         *
         * To deserialize the data returned by this function, in addition to the
         * serialized data, you must know the type of the #GVariant, and (if the
         * machine might be different) the endianness of the machine that stored
         * it. As a result, file formats or network messages that incorporate
         * serialized #GVariants must include this information either
         * implicitly (for instance "the file always contains a
         * %G_VARIANT_TYPE_VARIANT and it is always in little-endian order") or
         * explicitly (by storing the type and/or endianness in addition to the
         * serialized data).
         * @since 2.24
         * @returns the serialized form of `value`, or %NULL
         */
        get_data(): never | null
        /**
         * Returns a pointer to the serialized form of a #GVariant instance.
         * The semantics of this function are exactly the same as
         * g_variant_get_data(), except that the returned #GBytes holds
         * a reference to the variant data.
         * @since 2.36
         * @returns A new #GBytes representing the variant data
         */
        get_data_as_bytes(): Bytes
        /**
         * Returns the double precision floating point value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_DOUBLE.
         * @since 2.24
         * @returns a #gdouble
         */
        get_double(): number
        /**
         * Returns the 32-bit signed integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type other
         * than %G_VARIANT_TYPE_HANDLE.
         *
         * By convention, handles are indexes into an array of file descriptors
         * that are sent alongside a D-Bus message.  If you're not interacting
         * with D-Bus, you probably don't need them.
         * @since 2.24
         * @returns a #gint32
         */
        get_handle(): number
        /**
         * Returns the 16-bit signed integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_INT16.
         * @since 2.24
         * @returns a #gint16
         */
        get_int16(): number
        /**
         * Returns the 32-bit signed integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_INT32.
         * @since 2.24
         * @returns a #gint32
         */
        get_int32(): number
        /**
         * Returns the 64-bit signed integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_INT64.
         * @since 2.24
         * @returns a #gint64
         */
        get_int64(): number
        /**
         * Given a maybe-typed #GVariant instance, extract its value.  If the
         * value is Nothing, then this function returns %NULL.
         * @since 2.24
         * @returns the contents of `value`, or %NULL
         */
        get_maybe(): Variant | null
        /**
         * Gets a #GVariant instance that has the same value as `value` and is
         * trusted to be in normal form.
         *
         * If `value` is already trusted to be in normal form then a new
         * reference to `value` is returned.
         *
         * If `value` is not already trusted, then it is scanned to check if it
         * is in normal form.  If it is found to be in normal form then it is
         * marked as trusted and a new reference to it is returned.
         *
         * If `value` is found not to be in normal form then a new trusted
         * #GVariant is created with the same value as `value`. The non-normal parts of
         *  `value` will be replaced with default values which are guaranteed to be in
         * normal form.
         *
         * It makes sense to call this function if you've received #GVariant
         * data from untrusted sources and you want to ensure your serialized
         * output is definitely in normal form.
         *
         * If `value` is already in normal form, a new reference will be returned
         * (which will be floating if `value` is floating). If it is not in normal form,
         * the newly created #GVariant will be returned with a single non-floating
         * reference. Typically, g_variant_take_ref() should be called on the return
         * value from this function to guarantee ownership of a single non-floating
         * reference to it.
         * @since 2.24
         * @returns a trusted #GVariant
         */
        get_normal_form(): Variant
        /**
         * Gets the contents of an array of object paths #GVariant.  This call
         * makes a shallow copy; the return result should be released with
         * g_free(), but the individual strings must not be modified.
         *
         * If `length` is non-%NULL then the number of elements in the result
         * is stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.30
         * @returns an array of constant strings, the length of the result, or %NULL
         */
        get_objv(): string[]
        /**
         * Determines the number of bytes that would be required to store `value`
         * with g_variant_store().
         *
         * If `value` has a fixed-sized type then this function always returned
         * that fixed size.
         *
         * In the case that `value` is already in serialized form or the size has
         * already been calculated (ie: this function has been called before)
         * then this function is O(1).  Otherwise, the size is calculated, an
         * operation which is approximately O(n) in the number of values
         * involved.
         * @since 2.24
         * @returns the serialized size of `value`
         */
        get_size(): number
        /**
         * Returns the string value of a #GVariant instance with a string
         * type.  This includes the types %G_VARIANT_TYPE_STRING,
         * %G_VARIANT_TYPE_OBJECT_PATH and %G_VARIANT_TYPE_SIGNATURE.
         *
         * The string will always be UTF-8 encoded, will never be %NULL, and will never
         * contain nul bytes.
         *
         * If `length` is non-%NULL then the length of the string (in bytes) is
         * returned there.  For trusted values, this information is already
         * known.  Untrusted values will be validated and, if valid, a strlen() will be
         * performed. If invalid, a default value will be returned — for
         * %G_VARIANT_TYPE_OBJECT_PATH, this is `"/"`, and for other types it is the
         * empty string.
         *
         * It is an error to call this function with a `value` of any type
         * other than those three.
         *
         * The return value remains valid as long as `value` exists.
         * @since 2.24
         * @returns the constant string, UTF-8 encoded, a pointer to a #gsize,          to store the length
         */
        get_string(): string
        /**
         * Gets the contents of an array of strings #GVariant.  This call
         * makes a shallow copy; the return result should be released with
         * g_free(), but the individual strings must not be modified.
         *
         * If `length` is non-%NULL then the number of elements in the result
         * is stored there.  In any case, the resulting array will be
         * %NULL-terminated.
         *
         * For an empty array, `length` will be set to 0 and a pointer to a
         * %NULL pointer will be returned.
         * @since 2.24
         * @returns an array of constant strings, the length of the result, or %NULL
         */
        get_strv(): string[]
        /**
         * Determines the type of `value`.
         *
         * The return value is valid for the lifetime of `value` and must not
         * be freed.
         * @since 2.24
         * @returns a #GVariantType
         */
        get_type(): VariantType<S>
        /**
         * Returns the type string of `value`.  Unlike the result of calling
         * g_variant_type_peek_string(), this string is nul-terminated.  This
         * string belongs to #GVariant and must not be freed.
         * @since 2.24
         * @returns the type string for the type of `value`
         */
        get_type_string(): string
        /**
         * Returns the 16-bit unsigned integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_UINT16.
         * @since 2.24
         * @returns a #guint16
         */
        get_uint16(): number
        /**
         * Returns the 32-bit unsigned integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_UINT32.
         * @since 2.24
         * @returns a #guint32
         */
        get_uint32(): number
        /**
         * Returns the 64-bit unsigned integer value of `value`.
         *
         * It is an error to call this function with a `value` of any type
         * other than %G_VARIANT_TYPE_UINT64.
         * @since 2.24
         * @returns a #guint64
         */
        get_uint64(): number
        /**
         * Unboxes `value`.  The result is the #GVariant instance that was
         * contained in `value`.
         * @since 2.24
         * @returns the item contained in the variant
         */
        get_variant(): Variant
        /**
         * Generates a hash value for a #GVariant instance.
         *
         * The output of this function is guaranteed to be the same for a given
         * value only per-process.  It may change between different processor
         * architectures or even different versions of GLib.  Do not use this
         * function as a basis for building protocols or file formats.
         *
         * The type of `value` is #gconstpointer only to allow use of this
         * function with #GHashTable.  `value` must be a #GVariant.
         * @since 2.24
         * @returns a hash value corresponding to `value`
         */
        hash(): number
        /**
         * Checks if `value` is a container.
         * @since 2.24
         * @returns %TRUE if `value` is a container
         */
        is_container(): boolean
        /**
         * Checks whether `value` has a floating reference count.
         *
         * This function should only ever be used to assert that a given variant
         * is or is not floating, or for debug purposes. To acquire a reference
         * to a variant that might be floating, always use g_variant_ref_sink()
         * or g_variant_take_ref().
         *
         * See g_variant_ref_sink() for more information about floating reference
         * counts.
         * @since 2.26
         * @returns whether `value` is floating
         */
        is_floating(): boolean
        /**
         * Checks if `value` is in normal form.
         *
         * The main reason to do this is to detect if a given chunk of
         * serialized data is in normal form: load the data into a #GVariant
         * using g_variant_new_from_data() and then use this function to
         * check.
         *
         * If `value` is found to be in normal form then it will be marked as
         * being trusted.  If the value was already marked as being trusted then
         * this function will immediately return %TRUE.
         *
         * There may be implementation specific restrictions on deeply nested values.
         * GVariant is guaranteed to handle nesting up to at least 64 levels.
         * @since 2.24
         * @returns %TRUE if `value` is in normal form
         */
        is_normal_form(): boolean
        /**
         * Checks if a value has a type matching the provided type.
         * @since 2.24
         * @param type a #GVariantType
         * @returns %TRUE if the type of `value` matches `type`
         */
        is_of_type(type: VariantType): boolean
        /**
         * Looks up a value in a dictionary #GVariant.
         *
         * This function works with dictionaries of the type a{s*} (and equally
         * well with type a{o*}, but we only further discuss the string case
         * for sake of clarity).
         *
         * In the event that `dictionary` has the type a{sv}, the `expected_type`
         * string specifies what type of value is expected to be inside of the
         * variant. If the value inside the variant has a different type then
         * %NULL is returned. In the event that `dictionary` has a value type other
         * than v then `expected_type` must directly match the value type and it is
         * used to unpack the value directly or an error occurs.
         *
         * In either case, if `key` is not found in `dictionary`, %NULL is returned.
         *
         * If the key is found and the value has the correct type, it is
         * returned.  If `expected_type` was specified then any non-%NULL return
         * value will have this type.
         *
         * This function is currently implemented with a linear scan.  If you
         * plan to do many lookups then #GVariantDict may be more efficient.
         * @since 2.28
         * @param key the key to look up in the dictionary
         * @param expected_type a #GVariantType, or %NULL
         * @returns the value of the dictionary key, or %NULL
         */
        lookup_value(key: string, expected_type: VariantType | null): Variant
        /**
         * Determines the number of children in a container #GVariant instance.
         * This includes variants, maybes, arrays, tuples and dictionary
         * entries.  It is an error to call this function on any other type of
         * #GVariant.
         *
         * For variants, the return value is always 1.  For values with maybe
         * types, it is always zero or one.  For arrays, it is the length of the
         * array.  For tuples it is the number of tuple items (which depends
         * only on the type).  For dictionary entries, it is always 2
         *
         * This function is O(1).
         * @since 2.24
         * @returns the number of children in the container
         */
        n_children(): number
        /**
         * Pretty-prints `value` in the format understood by g_variant_parse().
         *
         * The format is described [here](gvariant-text-format.html).
         *
         * If `type_annotate` is %TRUE, then type information is included in
         * the output.
         * @since 2.24
         * @param type_annotate %TRUE if type information should be included in                 the output
         * @returns a newly-allocated string holding the result.
         */
        print(type_annotate: boolean): string
        /**
         * Unpacks the variant's data into a JavaScript value.
         *
         * This performs a **shallow unpacking operation** - only unpacking the top level.
         * For containers like arrays or dictionaries, child elements remain as Variant objects.
         *
         * @example
         * ```typescript
         * // Simple types are fully unpacked
         * const boolVariant = GLib.Variant.new_boolean(true);
         * const boolValue = boolVariant.unpack(); // → true
         *
         * // String values are unpacked (discarding length information)
         * const stringVariant = GLib.Variant.new_string("hello");
         * const stringValue = stringVariant.unpack(); // → "hello"
         *
         * // Arrays are unpacked but elements remain as Variants
         * const arrayVariant = GLib.Variant.new_strv(["one", "two"]);
         * const arrayValue = arrayVariant.unpack(); // → [Variant<"s">, Variant<"s">]
         * ```
         *
         * @returns The unpacked JavaScript value with child Variants preserved
         * @see {@link deepUnpack} for unpacking one level deeper
         * @see {@link recursiveUnpack} for full recursive unpacking
         */
        unpack(): $ParseVariant<S>
        /**
         * Deeply unpacks the variant's data into JavaScript values.
         *
         * This method unpacks a variant **and its direct children**, but only up to one level deep.
         * It's the most commonly used unpacking method for D-Bus operations and GSettings.
         *
         * @example
         * ```typescript
         * // Simple dictionary (a{ss}) - fully unpacked
         * const simpleDict = new GLib.Variant('a{ss}', {
         *   'key1': 'value1',
         *   'key2': 'value2'
         * });
         * const simple = simpleDict.deepUnpack(); // → { key1: "value1", key2: "value2" }
         *
         * // Complex dictionary (a{sv}) - values remain as Variants
         * const complexDict = new GLib.Variant('a{sv}', {
         *   'name': GLib.Variant.new_string('Mario'),
         *   'active': GLib.Variant.new_boolean(true)
         * });
         * const complex = complexDict.deepUnpack(); // → { name: Variant<"s">, active: Variant<"b"> }
         * ```
         *
         * @returns The deeply unpacked JavaScript value with one level of children unpacked
         * @see {@link unpack} for shallow unpacking only
         * @see {@link recursiveUnpack} for full recursive unpacking
         */
        deepUnpack(): $ParseDeepVariant<S>
        /**
         * @alias deepUnpack
         * @deprecated Use {@link deepUnpack}
         */
        deep_unpack(): $ParseDeepVariant<S>
        /**
         * Recursively unpacks the variant and **all its descendants** into native JavaScript values.
         *
         * This method performs complete recursive unpacking, converting all nested Variants
         * to their native JavaScript equivalents. **Type information may be lost** during
         * this process, so you'll need to know the original types to repack values.
         *
         * @example
         * ```typescript
         * // Complex nested structure fully unpacked
         * const complexDict = new GLib.Variant('a{sv}', {
         *   'name': GLib.Variant.new_string('Gnome'),
         *   'active': GLib.Variant.new_boolean(true)
         * });
         *
         * const fullyUnpacked = complexDict.recursiveUnpack();
         * // → { name: "Gnome", active: true }
         *
         * // All nested Variants are converted to native values
         * const nestedTuple = new GLib.Variant('(sa{sv})', [
         *   'player',
         *   { 'score': GLib.Variant.new_int32(100) }
         * ]);
         * const result = nestedTuple.recursiveUnpack();
         * // → ["player", { score: 100 }]
         * ```
         *
         * @returns The recursively unpacked JavaScript value with all Variants converted to native types
         * @see {@link deepUnpack} for one-level unpacking with type preservation
         * @see {@link unpack} for shallow unpacking only
         * @since GJS 1.64
         */
        recursiveUnpack(): $ParseRecursiveVariant<S>
    }

    /**
     * A utility class for building complex GVariant structures incrementally.
     *
     * VariantBuilder is useful when you need to construct variants dynamically
     * or when dealing with complex nested structures. It provides a way to
     * build variants step by step rather than constructing the entire structure at once.
     *
     * @example
     * ```typescript
     * // Building an array of variants
     * const builder = new GLib.VariantBuilder(new GLib.VariantType('av'));
     * builder.add_value(GLib.Variant.new_string('first'));
     * builder.add_value(GLib.Variant.new_int32(42));
     * builder.add_value(GLib.Variant.new_boolean(true));
     * const arrayVariant = builder.end(); // → Variant<'av'>
     *
     * // Building a dictionary incrementally
     * const dictBuilder = new GLib.VariantBuilder(new GLib.VariantType('a{sv}'));
     * dictBuilder.add_value(GLib.Variant.new_dict_entry(
     *   GLib.Variant.new_string('name'),
     *   GLib.Variant.new_variant(GLib.Variant.new_string('Mario'))
     * ));
     * const dict = dictBuilder.end();
     * ```
     */
    class VariantBuilder<S extends string = "a*"> {
        static readonly $gtype: GObject.GType<VariantBuilder>

        constructor(type: VariantType<S>)
        constructor(copy: VariantBuilder<S>)

        /**
         * Allocates and initialises a new #GVariantBuilder.
         *
         * You should call g_variant_builder_unref() on the return value when it
         * is no longer needed.  The memory will not be automatically freed by
         * any other call.
         *
         * In most cases it is easier to place a #GVariantBuilder directly on
         * the stack of the calling function and initialise it with
         * g_variant_builder_init_static().
         * @since 2.24
         * @param type a container type
         * @returns a #GVariantBuilder
         */
        static new<S extends string = "a*">(
            type: VariantType<S>,
        ): VariantBuilder<S>
        /**
         * Adds `value` to `builder`.
         *
         * It is an error to call this function in any way that would create an
         * inconsistent value to be constructed.  Some examples of this are
         * putting different types of items into an array, putting the wrong
         * types or number of items in a tuple, putting more than one value into
         * a variant, etc.
         *
         * @since 2.24
         * @param value a #GVariant
         */
        add_value(value: $ElementSig<$ParseDeepVariant<S>>): void
        /**
         * Closes the subcontainer inside the given `builder` that was opened by
         * the most recent call to g_variant_builder_open().
         *
         * It is an error to call this function in any way that would create an
         * inconsistent value to be constructed (ie: too few values added to the
         * subcontainer).
         * @since 2.24
         */
        close(): void
        /**
         * Ends the builder process and returns the constructed value.
         *
         * It is an error to call this function in any way that would create an
         * inconsistent value to be constructed (ie: insufficient number of
         * items added to a container with a specific number of children
         * required).  It is also an error to call this function if the builder
         * was created with an indefinite array or maybe type and no children
         * have been added; in this case it is impossible to infer the type of
         * the empty array.
         * @since 2.24
         * @returns The completed variant
         */
        end(): Variant<S>
        /**
         * Opens a subcontainer inside the given `builder`.  When done adding
         * items to the subcontainer, g_variant_builder_close() must be called. `type`
         * is the type of the container: so to build a tuple of several values, `type`
         * must include the tuple itself.
         *
         * It is an error to call this function in any way that would cause an
         * inconsistent value to be constructed (ie: adding too many values or
         * a value of an incorrect type).
         *
         * @since 2.24
         * @param type the #GVariantType of the container
         */
        open(type: VariantType): void
    }
    /**
     * #GVariantDict is a mutable interface to #GVariant dictionaries.
     *
     * It can be used for doing a sequence of dictionary lookups in an
     * efficient way on an existing #GVariant dictionary or it can be used
     * to construct new dictionaries with a hashtable-like interface.  It
     * can also be used for taking existing dictionaries and modifying them
     * in order to create new ones.
     *
     * #GVariantDict can only be used with %G_VARIANT_TYPE_VARDICT
     * dictionaries.
     *
     * @since 2.40
     */
    class VariantDict {
        static readonly $gtype: GObject.GType<VariantDict>

        constructor(from_asv?: Variant | null)
        constructor(copy: VariantDict)

        /**
         * Allocates and initialises a new #GVariantDict.
         *
         * @since 2.40
         * @param from_asv the #GVariant with which to initialise the   dictionary
         * @returns a #GVariantDict
         */
        static new(from_asv: Variant | null): VariantDict
        /**
         * Releases all memory associated with a #GVariantDict without freeing
         * the #GVariantDict structure itself.
         *
         * It is valid to call this function on either an initialised
         * #GVariantDict or one that was previously cleared by an earlier call
         * to g_variant_dict_clear() but it is not valid to call this function
         * on uninitialised memory.
         * @since 2.40
         */
        clear(): void
        /**
         * Checks if `key` exists in `dict`.
         * @since 2.40
         * @param key the key to look up in the dictionary
         * @returns %TRUE if `key` is in `dict`
         */
        contains(key: string): boolean
        /**
         * Returns the current value of `dict` as a #GVariant of type
         * %G_VARIANT_TYPE_VARDICT, clearing it in the process.
         *
         * @since 2.40
         * @returns a new, floating, #GVariant
         */
        end(): Variant
        /**
         * Inserts (or replaces) a key in a #GVariantDict.
         *
         *  `value` is consumed if it is floating.
         * @since 2.40
         * @param key the key to insert a value for
         * @param value the value to insert
         */
        insert_value(key: string, value: Variant): void
        /**
         * Looks up a value in a #GVariantDict.
         *
         * If `key` is not found in `dictionary`, %NULL is returned.
         *
         * The `expected_type` string specifies what type of value is expected.
         * If the value associated with `key` has a different type then %NULL is
         * returned.
         *
         * If the key is found and the value has the correct type, it is
         * returned.  If `expected_type` was specified then any non-%NULL return
         * value will have this type.
         * @since 2.40
         * @param key the key to look up in the dictionary
         * @param expected_type a #GVariantType, or %NULL
         * @returns the value of the dictionary key, or %NULL
         */
        lookup_value(
            key: string,
            expected_type: VariantType | null,
        ): Variant | null
        /**
         * Removes a key and its associated value from a #GVariantDict.
         * @since 2.40
         * @param key the key to remove
         * @returns %TRUE if the key was found and removed
         */
        remove(key: string): boolean

        /**
         * GJS shortcut for {@link lookup_value} that also unpacks the value.
         */
        lookup(
            key: string,
            variantType?: string | VariantType,
            deep?: boolean,
        ): unknown
    }
    /**
     * A type in the [type@GLib.Variant] type system.
     *
     * [type@GLib.Variant] types are represented as strings, but have a strict
     * syntax described below. All [type@GLib.VariantType]s passed to GLib must be
     * valid, and they are typically expected to be static (i.e. not provided by
     * user input) as they determine how binary [type@GLib.Variant] data is
     * interpreted.
     *
     * ## GVariant Type System
     *
     * This section introduces the [type@GLib.Variant] type system. It is based, in
     * large part, on the D-Bus type system, with two major changes and
     * some minor lifting of restrictions. The
     * [D-Bus specification](http://dbus.freedesktop.org/doc/dbus-specification.html),
     * therefore, provides a significant amount of
     * information that is useful when working with [type@GLib.Variant].
     *
     * The first major change with respect to the D-Bus type system is the
     * introduction of maybe (or ‘nullable’) types.  Any type in [type@GLib.Variant]
     * can be converted to a maybe type, in which case, `nothing` (or `null`)
     * becomes a valid value.  Maybe types have been added by introducing the
     * character `m` to type strings.
     *
     * The second major change is that the [type@GLib.Variant] type system supports
     * the concept of ‘indefinite types’ — types that are less specific than
     * the normal types found in D-Bus.  For example, it is possible to speak
     * of ‘an array of any type’ in [type@GLib.Variant], where the D-Bus type system
     * would require you to speak of ‘an array of integers’ or ‘an array of
     * strings’.  Indefinite types have been added by introducing the
     * characters `*`, `?` and `r` to type strings.
     *
     * Finally, all arbitrary restrictions relating to the complexity of
     * types are lifted along with the restriction that dictionary entries
     * may only appear nested inside of arrays.
     *
     * Just as in D-Bus, [type@GLib.Variant] types are described with strings (‘type
     * strings’).  Subject to the differences mentioned above, these strings
     * are of the same form as those found in D-Bus.  Note, however: D-Bus
     * always works in terms of messages and therefore individual type
     * strings appear nowhere in its interface.  Instead, ‘signatures’
     * are a concatenation of the strings of the type of each argument in a
     * message.  [type@GLib.Variant] deals with single values directly so
     * [type@GLib.Variant] type strings always describe the type of exactly one
     * value.  This means that a D-Bus signature string is generally not a valid
     * [type@GLib.Variant] type string — except in the case that it is the signature
     * of a message containing exactly one argument.
     *
     * An indefinite type is similar in spirit to what may be called an
     * abstract type in other type systems.  No value can exist that has an
     * indefinite type as its type, but values can exist that have types
     * that are subtypes of indefinite types.  That is to say,
     * [method@GLib.Variant.get_type] will never return an indefinite type, but
     * calling [method@GLib.Variant.is_of_type] with an indefinite type may return
     * true.  For example, you cannot have a value that represents ‘an
     * array of no particular type’, but you can have an ‘array of integers’
     * which certainly matches the type of ‘an array of no particular type’,
     * since ‘array of integers’ is a subtype of ‘array of no particular
     * type’.
     *
     * This is similar to how instances of abstract classes may not
     * directly exist in other type systems, but instances of their
     * non-abstract subtypes may.  For example, in GTK, no object that has
     * the type of [`GtkWidget`](https://docs.gtk.org/gtk4/class.Widget.html) can
     * exist (since `GtkWidget` is an abstract class), but a [`GtkWindow`](https://docs.gtk.org/gtk4/class.Window.html)
     * can certainly be instantiated, and you would say that a `GtkWindow` is a
     * `GtkWidget` (since `GtkWindow` is a subclass of `GtkWidget`).
     *
     * Two types may not be compared by value; use [method@GLib.VariantType.equal]
     * or [method@GLib.VariantType.is_subtype_of]  May be copied using
     * [method@GLib.VariantType.copy] and freed using [method@GLib.VariantType.free].
     *
     * ## GVariant Type Strings
     *
     * A [type@GLib.Variant] type string can be any of the following:
     *
     * - any basic type string (listed below)
     * - `v`, `r` or `*`
     * - one of the characters `a` or `m`, followed by another type string
     * - the character `(`, followed by a concatenation of zero or more other
     *   type strings, followed by the character `)`
     * - the character `{`, followed by a basic type string (see below),
     *   followed by another type string, followed by the character `}`
     *
     * A basic type string describes a basic type (as per
     * [method@GLib.VariantType.is_basic]) and is always a single character in
     * length. The valid basic type strings are `b`, `y`, `n`, `q`, `i`, `u`, `x`,
     * `t`, `h`, `d`, `s`, `o`, `g` and `?`.
     *
     * The above definition is recursive to arbitrary depth. `aaaaai` and
     * `(ui(nq((y)))s)` are both valid type strings, as is
     * `a(aa(ui)(qna{ya(yd)}))`. In order to not hit memory limits,
     * [type@GLib.Variant] imposes a limit on recursion depth of 65 nested
     * containers. This is the limit in the D-Bus specification (64) plus one to
     * allow a [`GDBusMessage`](../gio/class.DBusMessage.html) to be nested in
     * a top-level tuple.
     *
     * The meaning of each of the characters is as follows:
     *
     * - `b`: the type string of `G_VARIANT_TYPE_BOOLEAN`; a boolean value.
     * - `y`: the type string of `G_VARIANT_TYPE_BYTE`; a byte.
     * - `n`: the type string of `G_VARIANT_TYPE_INT16`; a signed 16 bit integer.
     * - `q`: the type string of `G_VARIANT_TYPE_UINT16`; an unsigned 16 bit integer.
     * - `i`: the type string of `G_VARIANT_TYPE_INT32`; a signed 32 bit integer.
     * - `u`: the type string of `G_VARIANT_TYPE_UINT32`; an unsigned 32 bit integer.
     * - `x`: the type string of `G_VARIANT_TYPE_INT64`; a signed 64 bit integer.
     * - `t`: the type string of `G_VARIANT_TYPE_UINT64`; an unsigned 64 bit integer.
     * - `h`: the type string of `G_VARIANT_TYPE_HANDLE`; a signed 32 bit value
     *   that, by convention, is used as an index into an array of file
     *   descriptors that are sent alongside a D-Bus message.
     * - `d`: the type string of `G_VARIANT_TYPE_DOUBLE`; a double precision
     *   floating point value.
     * - `s`: the type string of `G_VARIANT_TYPE_STRING`; a string.
     * - `o`: the type string of `G_VARIANT_TYPE_OBJECT_PATH`; a string in the form
     *   of a D-Bus object path.
     * - `g`: the type string of `G_VARIANT_TYPE_SIGNATURE`; a string in the form of
     *   a D-Bus type signature.
     * - `?`: the type string of `G_VARIANT_TYPE_BASIC`; an indefinite type that
     *   is a supertype of any of the basic types.
     * - `v`: the type string of `G_VARIANT_TYPE_VARIANT`; a container type that
     *   contain any other type of value.
     * - `a`: used as a prefix on another type string to mean an array of that
     *   type; the type string `ai`, for example, is the type of an array of
     *   signed 32-bit integers.
     * - `m`: used as a prefix on another type string to mean a ‘maybe’, or
     *   ‘nullable’, version of that type; the type string `ms`, for example,
     *   is the type of a value that maybe contains a string, or maybe contains
     *   nothing.
     * - `()`: used to enclose zero or more other concatenated type strings to
     *   create a tuple type; the type string `(is)`, for example, is the type of
     *   a pair of an integer and a string.
     * - `r`: the type string of `G_VARIANT_TYPE_TUPLE`; an indefinite type that is
     *   a supertype of any tuple type, regardless of the number of items.
     * - `{}`: used to enclose a basic type string concatenated with another type
     *   string to create a dictionary entry type, which usually appears inside of
     *   an array to form a dictionary; the type string `a{sd}`, for example, is
     *   the type of a dictionary that maps strings to double precision floating
     *   point values.
     *
     *   The first type (the basic type) is the key type and the second type is
     *   the value type. The reason that the first type is restricted to being a
     *   basic type is so that it can easily be hashed.
     * - `*`: the type string of `G_VARIANT_TYPE_ANY`; the indefinite type that is
     *   a supertype of all types.  Note that, as with all type strings, this
     *   character represents exactly one type. It cannot be used inside of tuples
     *   to mean ‘any number of items’.
     *
     * Any type string of a container that contains an indefinite type is,
     * itself, an indefinite type. For example, the type string `a*`
     * (corresponding to `G_VARIANT_TYPE_ARRAY`) is an indefinite type
     * that is a supertype of every array type. `(*s)` is a supertype
     * of all tuples that contain exactly two items where the second
     * item is a string.
     *
     * `a{?*}` is an indefinite type that is a supertype of all arrays
     * containing dictionary entries where the key is any basic type and
     * the value is any type at all.  This is, by definition, a dictionary,
     * so this type string corresponds to `G_VARIANT_TYPE_DICTIONARY`. Note
     * that, due to the restriction that the key of a dictionary entry must
     * be a basic type, `{**}` is not a valid type string.
     * @since 2.24
     */
    class VariantType<S extends string = any> {
        static readonly $gtype: GObject.GType<VariantType>

        constructor(type_string: S)
        constructor(copy: VariantType<S>)

        /**
         * Creates a new [type@GLib.VariantType] corresponding to the type string given
         * by `type_string`.
         *
         * It is a programmer error to call this function with an invalid type
         * string.  Use [func@GLib.VariantType.string_is_valid] if you are unsure.
         * @since 2.24
         * @param type_string a valid [GVariant type string](./struct.VariantType.html#gvariant-type-strings)
         * @returns a new [type@GLib.VariantType]
         */
        static new<S extends string>(type_string: S): VariantType<S>
        /**
         * Constructs the type corresponding to an array of elements of the
         * type `type`.
         *
         * It is appropriate to call [method@GLib.VariantType.first] on the return value.
         * @param element an element type
         * @returns a new array type Since 2.24
         */
        static new_array<S extends string>(
            element: VariantType<S>,
        ): VariantType<`a${S}`>
        /**
         * Constructs the type corresponding to a dictionary entry with a key
         * of type `key` and a value of type `value`.
         *
         * It is appropriate to call [method@GLib.VariantType.free] on the return value.
         * @param key a basic type to use for the key
         * @param value a type to use for the value
         * @returns a new dictionary entry type Since 2.24
         */
        static new_dict_entry<K extends string, V extends string>(
            key: VariantType<K>,
            value: VariantType<V>,
        ): VariantType<`{${K}${V}}`>
        /**
         * Constructs the type corresponding to a ‘maybe’ instance containing
         * type `type` or `Nothing`.
         *
         * It is appropriate to call [method@GLib.VariantType.free] on the return value.
         * @param element an element type
         * @returns a new ‘maybe’ type Since 2.24
         */
        static new_maybe<S extends string>(
            element: VariantType<S>,
        ): VariantType<`m${S}`>
        /**
         * Constructs a new tuple type, from `items`.
         *
         *  `length` is the number of items in `items`, or `-1` to indicate that
         *  `items` is `NULL`-terminated.
         *
         * It is appropriate to call [method@GLib.VariantType.free] on the return value.
         * @param items an array of types, one for each item
         * @returns a new tuple type Since 2.24
         */
        static new_tuple<
            Items extends ReadonlyArray<VariantType> | readonly [VariantType],
        >(items: Items): VariantType<`(${$ToTuple<Items>})`>
        /**
         * Checks if `type_string` is a valid
         * [GVariant type string](./struct.VariantType.html#gvariant-type-strings).
         *
         * This call is equivalent to calling [func@GLib.VariantType.string_scan] and
         * confirming that the following character is a nul terminator.
         * @param type_string a pointer to any string
         * @returns true if `type_string` is exactly one valid type string Since 2.24
         */
        static string_is_valid(type_string: string): boolean
        /**
         * Scan for a single complete and valid GVariant type string in `string`.
         *
         * The memory pointed to by `limit` (or bytes beyond it) is never
         * accessed.
         *
         * If a valid type string is found, `endptr` is updated to point to the
         * first character past the end of the string that was found and %TRUE
         * is returned.
         *
         * If there is no valid type string starting at `string`, or if the type
         * string does not end before `limit` then %FALSE is returned.
         *
         * For the simple case of checking if a string is a valid type string,
         * see [func@GLib.VariantType.string_is_valid].
         * @since 2.24
         * @param string a pointer to any string
         * @param limit the end of `string`
         * @returns true if a valid type string was found, location to store the end pointer
         */
        static string_scan(
            string: string,
            limit: string | null,
        ): [boolean, string]
        /**
         * Makes a copy of a [type@GLib.VariantType].
         *
         * It is appropriate to call [method@GLib.VariantType.free] on the return value.
         *  `type` may not be `NULL`.
         * @returns a new [type@GLib.VariantType] Since 2.24
         */
        copy(): VariantType<S>
        /**
         * Returns a newly-allocated copy of the type string corresponding to `type`.
         *
         * The returned string is nul-terminated.  It is appropriate to call
         * [func@GLib.free] on the return value.
         * @returns the corresponding type string Since 2.24
         */
        dup_string(): string
        /**
         * Determines the element type of an array or ‘maybe’ type.
         *
         * This function may only be used with array or ‘maybe’ types.
         * @returns the element type of `type` Since 2.24
         */
        element(): VariantType
        /**
         * Compares `type1` and `type2` for equality.
         *
         * Only returns true if the types are exactly equal.  Even if one type
         * is an indefinite type and the other is a subtype of it, false will
         * be returned if they are not exactly equal.  If you want to check for
         * subtypes, use [method@GLib.VariantType.is_subtype_of].
         *
         * The argument types of `type1` and `type2` are only `gconstpointer` to
         * allow use with [type@GLib.HashTable] without function pointer casting.  For
         * both arguments, a valid [type@GLib.VariantType] must be provided.
         * @param type2 another type to compare
         * @returns true if `type1` and `type2` are exactly equal Since 2.24
         */
        equal(type2: VariantType): boolean
        /**
         * Determines the first item type of a tuple or dictionary entry
         * type.
         *
         * This function may only be used with tuple or dictionary entry types,
         * but must not be used with the generic tuple type
         * `G_VARIANT_TYPE_TUPLE`.
         *
         * In the case of a dictionary entry type, this returns the type of
         * the key.
         *
         * `NULL` is returned in case of `type` being `G_VARIANT_TYPE_UNIT`.
         *
         * This call, together with [method@GLib.VariantType.next] provides an iterator
         * interface over tuple and dictionary entry types.
         * @returns the first item type of `type`, or `NULL`   if the type has no item types Since 2.24
         */
        first(): VariantType | null
        /**
         * Frees a [type@GLib.VariantType] that was allocated with
         * [method@GLib.VariantType.copy], [ctor@GLib.VariantType.new] or one of the
         * container type constructor functions.
         *
         * In the case that `type` is `NULL`, this function does nothing.
         *
         * Since 2.24
         */
        free(): void
        /**
         * Returns the length of the type string corresponding to the given `type`.
         *
         * This function must be used to determine the valid extent of
         * the memory region returned by [method@GLib.VariantType.peek_string].
         * @returns the length of the corresponding type string Since 2.24
         */
        get_string_length(): number
        /**
         * Hashes `type`.
         *
         * The argument type of `type` is only `gconstpointer` to allow use with
         * [type@GLib.HashTable] without function pointer casting.  A valid
         * [type@GLib.VariantType] must be provided.
         * @returns the hash value Since 2.24
         */
        hash(): number
        /**
         * Determines if the given `type` is an array type.
         *
         * This is true if the type string for `type` starts with an `a`.
         *
         * This function returns true for any indefinite type for which every
         * definite subtype is an array type — `G_VARIANT_TYPE_ARRAY`, for
         * example.
         * @returns true if `type` is an array type Since 2.24
         */
        is_array(): boolean
        /**
         * Determines if the given `type` is a basic type.
         *
         * Basic types are booleans, bytes, integers, doubles, strings, object
         * paths and signatures.
         *
         * Only a basic type may be used as the key of a dictionary entry.
         *
         * This function returns `FALSE` for all indefinite types except
         * `G_VARIANT_TYPE_BASIC`.
         * @returns true if `type` is a basic type Since 2.24
         */
        is_basic(): boolean
        /**
         * Determines if the given `type` is a container type.
         *
         * Container types are any array, maybe, tuple, or dictionary
         * entry types plus the variant type.
         *
         * This function returns true for any indefinite type for which every
         * definite subtype is a container — `G_VARIANT_TYPE_ARRAY`, for
         * example.
         * @returns true if `type` is a container type Since 2.24
         */
        is_container(): boolean
        /**
         * Determines if the given `type` is definite (ie: not indefinite).
         *
         * A type is definite if its type string does not contain any indefinite
         * type characters (`*`, `?`, or `r`).
         *
         * A [type@GLib.Variant] instance may not have an indefinite type, so calling
         * this function on the result of [method@GLib.Variant.get_type] will always
         * result in true being returned.  Calling this function on an
         * indefinite type like `G_VARIANT_TYPE_ARRAY`, however, will result in
         * `FALSE` being returned.
         * @returns true if `type` is definite Since 2.24
         */
        is_definite(): boolean
        /**
         * Determines if the given `type` is a dictionary entry type.
         *
         * This is true if the type string for `type` starts with a `{`.
         *
         * This function returns true for any indefinite type for which every
         * definite subtype is a dictionary entry type —
         * `G_VARIANT_TYPE_DICT_ENTRY`, for example.
         * @returns true if `type` is a dictionary entry type Since 2.24
         */
        is_dict_entry(): boolean
        /**
         * Determines if the given `type` is a ‘maybe’ type.
         *
         * This is true if the type string for `type` starts with an `m`.
         *
         * This function returns true for any indefinite type for which every
         * definite subtype is a ‘maybe’ type — `G_VARIANT_TYPE_MAYBE`, for
         * example.
         * @returns true if `type` is a ‘maybe’ type Since 2.24
         */
        is_maybe(): boolean
        /**
         * Checks if `type` is a subtype of `supertype`.
         *
         * This function returns true if `type` is a subtype of `supertype`.  All
         * types are considered to be subtypes of themselves.  Aside from that,
         * only indefinite types can have subtypes.
         * @param supertype type of potential supertype
         * @returns true if `type` is a subtype of `supertype` Since 2.24
         */
        is_subtype_of(supertype: VariantType): boolean
        /**
         * Determines if the given `type` is a tuple type.
         *
         * This is true if the type string for `type` starts with a `(` or if `type` is
         * `G_VARIANT_TYPE_TUPLE`.
         *
         * This function returns true for any indefinite type for which every
         * definite subtype is a tuple type — `G_VARIANT_TYPE_TUPLE`, for
         * example.
         * @returns true if `type` is a tuple type Since 2.24
         */
        is_tuple(): boolean
        /**
         * Determines if the given `type` is the variant type.
         * @returns true if `type` is the variant type Since 2.24
         */
        is_variant(): boolean
        /**
         * Determines the key type of a dictionary entry type.
         *
         * This function may only be used with a dictionary entry type.  Other
         * than the additional restriction, this call is equivalent to
         * [method@GLib.VariantType.first].
         * @returns the key type of the dictionary entry Since 2.24
         */
        key(): VariantType
        /**
         * Determines the number of items contained in a tuple or
         * dictionary entry type.
         *
         * This function may only be used with tuple or dictionary entry types,
         * but must not be used with the generic tuple type
         * `G_VARIANT_TYPE_TUPLE`.
         *
         * In the case of a dictionary entry type, this function will always
         * return `2`.
         * @returns the number of items in `type` Since 2.24
         */
        n_items(): number
        /**
         * Determines the next item type of a tuple or dictionary entry
         * type.
         *
         *  `type` must be the result of a previous call to
         * [method@GLib.VariantType.first] or [method@GLib.VariantType.next].
         *
         * If called on the key type of a dictionary entry then this call
         * returns the value type.  If called on the value type of a dictionary
         * entry then this call returns `NULL`.
         *
         * For tuples, `NULL` is returned when `type` is the last item in the tuple.
         * @returns the next type after `type`, or `NULL` if   there are no further types Since 2.24
         */
        next(): VariantType | null
        /**
         * Determines the value type of a dictionary entry type.
         *
         * This function may only be used with a dictionary entry type.
         * @returns the value type of the dictionary entry Since 2.24
         */
        value(): VariantType
    }
}
