// See: https://github.com/gjsify/ts-for-gir/issues/286

/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type GLib from "gi://GLib"

type Variant<S extends string = any> = GLib.Variant<S>

// prettier-ignore
type CreateIndexType<Key extends string, Value> =
    Key extends `s` | `o` | `g` ? { [key: string]: Value } :
    Key extends `n` | `q` | `t` | `d` | `u` | `i` | `x` | `y` ? { [key: number]: Value } : never;

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
    : VariantTypeError<`$ParseDeepVariantDict encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`2: $ParseDeepVariantValue returned unexpected value for: ${State}`>;

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
    : VariantTypeError<`$ParseDeepVariantKeyValue encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`$ParseDeepVariantValue encountered an invalid variant string: ${State} (2)`>;

// prettier-ignore
type $ParseDeepVariant<T extends string> =
    $ParseDeepVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : VariantTypeError<"$ParseDeepVariantValue returned unexpected Result">
    : VariantTypeError<"$ParseDeepVariantValue returned uninferrable Result">;

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
    : VariantTypeError<`$ParseRecursiveVariantDict encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`$ParseRecursiveVariantValue returned unexpected value for: ${State} (2)`>;

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
    : VariantTypeError<`$ParseRecursiveVariantKeyValue encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`$ParseRecursiveVariantValue encountered an invalid variant string: ${State} (2)`>;

// prettier-ignore
type $ParseRecursiveVariant<T extends string> =
    $ParseRecursiveVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : never
    : never;

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
    : VariantTypeError<`$ParseVariantDict encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`$ParseVariantValue returned unexpected value for: ${State} (2)`>;

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
    : VariantTypeError<`$ParseVariantKeyValue encountered an invalid variant string: ${State} (2)`>;

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
    : VariantTypeError<`$ParseShallowRootVariantValue encountered an invalid variant string: ${State} (1)`>;

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
    : VariantTypeError<`$ParseVariantValue encountered an invalid variant string: ${State} (2)`>;

// prettier-ignore
type $ParseVariant<T extends string> =
    $ParseShallowRootVariantValue<T> extends infer Result
    ? Result extends [infer Value, string]
    ? Value
    : Result extends VariantTypeError<any>
    ? Result
    : never
    : never;

export type Infer<S extends string> = $ParseVariant<S>
export type DeepInfer<S extends string> = $ParseDeepVariant<S>
export type RecursiveInfer<S extends string> = $ParseRecursiveVariant<S>
