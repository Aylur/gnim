import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { type Accessor, createAccessor, type Setter } from "../jsx/reactive.js"
import {
    type CamelCase,
    camelcase,
    connect,
    type DeepInferVariant as DeepInfer,
    disconnect,
    type PascalCase,
    type Prettify,
    type RecursiveInferVariant as RecursiveInfer,
    xml,
    type XmlNode,
} from "../util.js"

type SetterName<T> = `set${PascalCase<T>}`

type Settings<T extends Record<string, string>> = {
    [K in keyof T as Uncapitalize<PascalCase<K>>]: Accessor<RecursiveInfer<T[K]>>
} & {
    [K in keyof T as SetterName<K>]: Setter<DeepInfer<T[K]>>
}

function settingsObject<const T extends Record<string, string>>(
    settings: Gio.Settings,
    record: T,
): Settings<T> {
    const entries = Object.entries(record)

    const setters = entries.map(([key, type]) => [
        `set${key[0].toUpperCase() + camelcase(key).slice(1)}`,
        (v: unknown) => {
            const next = typeof v === "function" ? v(settings.get_value(key).deepUnpack()) : v
            settings.set_value(key, new GLib.Variant(type, next))
        },
    ])

    const accessors = entries.map(([key]) => [
        camelcase(key),
        createAccessor(
            () => settings.get_value(key).recursiveUnpack(),
            (callback) => {
                const id = connect(settings, `changed::${key}`, callback)
                return () => disconnect(settings, id)
            },
        ),
    ])

    return Object.fromEntries([...setters, ...accessors])
}

const internal = Symbol("gnim.gschema.internals")

function serialize(type: string, value: any) {
    return `<![CDATA[ ${GLib.Variant.new(type, value).print(false)} ]]>`
}

function childIf<T>(value: T, child: (value: NonNullable<T>) => XmlNode) {
    return value ? [child(value)] : []
}

export class Enum<Id extends string = string, Nick extends string = string> {
    readonly id: Id
    readonly values: Record<Nick, number>
    declare nicks: Nick

    constructor(id: Id, values: Record<Nick, number> | Nick[]) {
        this.id = id
        this.values = Array.isArray(values)
            ? (Object.fromEntries(values.map((nick, index) => [nick, index])) as Record<
                  Nick,
                  number
              >)
            : values
    }
}

export class Flags<Id extends string = string, Nick extends string = string> {
    readonly id: Id
    readonly values: Record<Nick, number>
    declare nicks: Nick

    constructor(id: Id, values: Record<Nick, number> | Nick[]) {
        this.id = id
        this.values = Array.isArray(values)
            ? (Object.fromEntries(values.map((nick, index) => [nick, 2 ** index])) as Record<
                  Nick,
                  number
              >)
            : values
    }
}

type TypedKey<Name extends string = string, Type extends string = string> = {
    name: Name
    type: Type
}

type EnumKey<Name extends string = string, Enumeration extends Enum = Enum> = {
    name: Name
    enum: Enumeration
    aliases: Record<string, Enumeration["nicks"][number]>
}

type FlagsKey<Name extends string = string, Flag extends Flags = Flags> = {
    name: Name
    flag: Flag
}

type KeyProps<T = any> = {
    default: T
    summary?: string
    description?: string
}

// `override` child nodes are unsupported: use composition instead
// `extends` attribute is unsupported: use composition instead
export class Schema<
    TypedKeys extends Array<TypedKey> = [],
    EnumKeys extends Array<EnumKey> = [],
    FlagsKeys extends Array<FlagsKey> = [],
> {
    readonly id: string
    readonly path?: string
    readonly gettextDomain?: string

    constructor(
        props:
            | string
            | {
                  id: string
                  path?: string
                  gettextDomain?: string
              },
    ) {
        if (typeof props === "string") {
            this.id = props
        } else {
            this.id = props.id
            this.path = props.path
            this.gettextDomain = props.gettextDomain
        }

        if (this.path && !this.path.startsWith("/") && !this.path.endsWith("/")) {
            throw Error("Schema path should start and end with a forward slash '/'")
        }

        if (props instanceof Schema) {
            this[internal] = {
                typedKeys: new Set(props[internal].typedKeys),
                flagsKeys: new Set(props[internal].flagsKeys),
                enumKeys: new Set(props[internal].enumKeys),
                nodes: [...props[internal].nodes],
            }
        }
    }

    [internal] = {
        typedKeys: new Set<TypedKey>(),
        flagsKeys: new Set<FlagsKey>(),
        enumKeys: new Set<EnumKey>(),
        nodes: new Array<XmlNode>(),
    }

    #addFlagsKey(key: FlagsKey) {
        const schema = new Schema<TypedKeys, EnumKeys, FlagsKeys>(this)
        schema[internal].flagsKeys.add(key)
        return schema
    }

    #addEnumKey(key: EnumKey) {
        const schema = new Schema<TypedKeys, EnumKeys, FlagsKeys>(this)
        schema[internal].enumKeys.add(key)
        return schema
    }

    #addTypedKey(key: TypedKey) {
        const schema = new Schema<TypedKeys, EnumKeys, FlagsKeys>(this)
        schema[internal].typedKeys.add(key)
        return schema
    }

    #addKey(
        name: string,
        type: { type: string } | { enum: string } | { flags: string },
        children: Array<XmlNode>,
    ) {
        if (this[internal].nodes.some((key) => key.attributes?.name === name)) {
            throw Error(`duplicate key: "${name}"`)
        }

        const schema = new Schema<TypedKeys, EnumKeys, FlagsKeys>(this)
        schema[internal].nodes.push({
            name: "key",
            attributes: Object.assign({ name }, type),
            children,
        })
        return schema
    }

    // TODO: `choices`
    key<const Name extends string, const Type extends string>(
        name: Name,
        type: Type,
        props: KeyProps<DeepInfer<Type>> & {
            range?: {
                min?: number
                max?: number
            }
        },
    ): Schema<[...TypedKeys, { name: Name; type: Type }], EnumKeys, FlagsKeys>

    // TODO: `aliases`
    key<const Name extends string, const E extends Enum<string, string>>(
        name: Name,
        enumeration: E,
        props: KeyProps<E["nicks"]>,
    ): Schema<TypedKeys, [...EnumKeys, EnumKey<Name, E>], FlagsKeys>

    key<const Name extends string, const F extends Flags<string, string>>(
        name: Name,
        flags: F,
        props: KeyProps<Array<F["nicks"]>>,
    ): Schema<TypedKeys, EnumKeys, [...FlagsKeys, FlagsKey<Name, F>]>

    key(
        name: string,
        type: string | Flags | Enum,
        props: KeyProps & {
            range?: { min?: number; max?: number }
        },
    ) {
        const summary = childIf(props.summary, (summary) => ({
            name: "summary",
            children: summary,
        }))

        const description = childIf(props.description, (description) => ({
            name: "description",
            children: description,
        }))

        if (typeof type === "string") {
            return this.#addTypedKey({ name, type }).#addKey(name, { type }, [
                { name: "default", children: serialize(type, props.default) },
                ...summary,
                ...description,
                ...childIf(props.range, ({ min, max }) => ({
                    name: "range",
                    attributes: {
                        ...(typeof min === "number" && { min }),
                        ...(typeof max === "number" && { max }),
                    },
                })),
            ])
        }

        if (type instanceof Enum) {
            return this.#addEnumKey({ name, enum: type, aliases: {} }).#addKey(
                name,
                { enum: type.id },
                [
                    { name: "default", children: serialize("s", props.default) },
                    ...summary,
                    ...description,
                ],
            )
        }

        if (type instanceof Flags) {
            return this.#addFlagsKey({ name, flag: type }).#addKey(name, { flags: type.id }, [
                { name: "default", children: serialize("as", props.default) },
                ...summary,
                ...description,
            ])
        }

        throw Error()
    }

    // TODO: support children nodes
    // child<const Name extends string>(name: Name, schema: Schema) {
    // }
}

export function defineSchemaList(
    props: Array<Schema> | { gettextDomain: string; schemas: Array<Schema> },
) {
    const schemas = Array.isArray(props) ? props : props.schemas
    const enums = new Set(
        schemas.flatMap((s) => [...s[internal].enumKeys.values()].map((e) => e.enum)),
    )
    const flags = new Set(
        schemas.flatMap((s) => [...s[internal].flagsKeys.values()].map((f) => f.flag)),
    )

    return xml({
        name: "schemalist",
        attributes: "gettextDomain" in props ? { gettextDomain: props.gettextDomain } : {},
        children: [
            ...[...enums.values()].map(({ id, values }) => ({
                name: "enum",
                attributes: { id },
                children: Object.entries(values).map(([nick, value]) => ({
                    name: "value",
                    attributes: { nick, value: value.toString() },
                })),
            })),

            ...[...flags.values()].map(({ id, values }) => ({
                name: "flags",
                attributes: { id },
                children: Object.entries(values).map(([nick, value]) => ({
                    name: "value",
                    attributes: { nick, value: value.toString() },
                })),
            })),

            ...schemas.map((s) => ({
                name: "schema",
                attributes: {
                    id: s.id,
                    ...(s.path && { path: s.path }),
                    ...(s.gettextDomain && { gettextDomain: s.gettextDomain }),
                },
                children: s[internal].nodes,
            })),
        ],
    })
}

// prettier-ignore
type SchemaSettings<S> = S extends Schema<infer TypedKeys, infer EnumKeys, infer FlagsKeys>
    ? { [K in TypedKeys[number] as CamelCase<K["name"]>]: Accessor<RecursiveInfer<K["type"]>> }
    & { [K in TypedKeys[number] as SetterName<K["name"]>]: Setter<DeepInfer<K["type"]>> }
    & { [E in EnumKeys[number] as CamelCase<E["name"]>]: Accessor<E["enum"]["nicks"]> }
    & { [E in EnumKeys[number] as SetterName<E["name"]>]: Setter<E["enum"]["nicks"]> }
    & { [F in FlagsKeys[number] as CamelCase<F["name"]>]: Accessor<Array<F["flag"]["nicks"]>> }
    & { [F in FlagsKeys[number] as SetterName<F["name"]>]: Setter< Array<F["flag"]["nicks"]>> }
    : never

/**
 * Wrap a {@link Gio.Settings} into a collection of setters and accessors.
 *
 * @example
 *
 * ```ts
 * const s = createSettings(settings, {
 *   "complex-key": "a{sa{ss}}",
 *   "simple-key": "s",
 * })
 *
 * effect(() => {
 *   console.log(`${s.complexKey()}`)
 * })
 *
 * s.setComplexKey((prev) => ({
 *   ...prev,
 *   key: { nested: "" },
 * }))
 * ```
 */
export function createSettings<const T extends Record<string, string>>(
    settings: Gio.Settings,
    record: T,
): Prettify<Settings<T>>

/**
 * Wrap a {@link Gio.Settings} according to a schema.
 */
export function createSettings<S extends Schema>(
    settings: Gio.Settings,
    schema: S,
): Prettify<SchemaSettings<S>>

/**
 * Instantiate a {@link Gio.Settings} for a given schema.
 */
export function createSettings<S extends Schema>(schema: S): Prettify<SchemaSettings<S>>

export function createSettings(
    first: Gio.Settings | Schema,
    second?: Schema | Record<string, string>,
) {
    if (second instanceof Schema && first instanceof Gio.Settings) {
        const keys = [
            ...[...second[internal].typedKeys].map((key) => [key.name, key.type]),
            ...[...second[internal].enumKeys].map((key) => [key.name, "s"]),
            ...[...second[internal].flagsKeys].map((key) => [key.name, "as"]),
        ]

        return settingsObject(first, Object.fromEntries(keys)) as SchemaSettings<Schema>
    }

    if (typeof second === "object" && first instanceof Gio.Settings) {
        return settingsObject(first, second as Record<string, string>)
    }

    if (first instanceof Schema) {
        return createSettings(new Gio.Settings({ schemaId: first.id }), first)
    }

    throw Error("invalid arguments")
}

export type CreateSettings<T> = T extends Schema
    ? Prettify<SchemaSettings<T>>
    : T extends Record<string, string>
      ? Prettify<Settings<T>>
      : never
