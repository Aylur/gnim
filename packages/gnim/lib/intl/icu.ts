// Parser is mostly taken from https://github.com/schummar/schummar-translate

import type { PrimitiveType } from "intl-messageformat"

type Flatten<T> = T extends object
    ? {
          [P in keyof T]: T[P]
      }
    : T

type EmptyObject = Record<never, never>

type OtherString = string & {
    __type: "other"
}

type Whitespace = " " | "\t" | "\n" | "\r"

type Trim<T> = T extends `${Whitespace}${infer Rest}`
    ? Trim<Rest>
    : T extends `${infer Rest}${Whitespace}`
      ? Trim<Rest>
      : T extends string
        ? T
        : never

type FindBlocks<Text> = Text extends `${string}{${infer Right}`
    ? ReadBlock<"", Right, ""> extends [infer Block, infer Tail]
        ? [Block, ...FindBlocks<Tail>]
        : [EmptyObject]
    : []

type TupleFindBlocks<T> = T extends readonly [infer First, ...infer Rest]
    ? [...FindBlocks<First>, ...TupleFindBlocks<Rest>]
    : []

type ReadBlock<
    Block extends string,
    Tail extends string,
    Depth extends string,
> = Tail extends `${infer L1}}${infer R1}`
    ? L1 extends `${infer L2}{${infer R2}`
        ? ReadBlock<`${Block}${L2}{`, `${R2}}${R1}`, `${Depth}+`>
        : Depth extends `+${infer Rest}`
          ? ReadBlock<`${Block}${L1}}`, R1, Rest>
          : [`${Block}${L1}`, R1]
    : []

type ParseBlock<Block> = Block extends `${infer Name},${infer Format},${infer Rest}`
    ? Trim<Format> extends "select"
        ? SelectOptions<Trim<Name>, Trim<Rest>>
        : {
              [K in Trim<Name>]: VariableType<Trim<Format>>
          } & TupleParseBlock<TupleFindBlocks<FindBlocks<Rest>>>
    : Block extends `${infer Name},${infer Format}`
      ? {
            [K in Trim<Name>]: VariableType<Trim<Format>>
        }
      : {
            [K in Trim<Block>]: PrimitiveType
        }

type TupleParseBlock<T> = T extends readonly [infer First, ...infer Rest]
    ? ParseBlock<First> & TupleParseBlock<Rest>
    : EmptyObject

type VariableType<T extends string> = T extends "number" | "plural" | "selectordinal"
    ? number
    : T extends "date" | "time"
      ? Date
      : PrimitiveType

type SelectOptions<Name extends string, Rest> = KeepAndMerge<ParseSelectBlock<Name, Rest>>

type ParseSelectBlock<Name extends string, Rest> = Rest extends `${infer Left}{${infer Right}`
    ? ReadBlock<"", Right, ""> extends [infer Block, infer Tail]
        ? | ({
                [K in Name]: HandleOther<Trim<Left>>
            } & TupleParseBlock<FindBlocks<Block>>)
          | ParseSelectBlock<Name, Tail>
        : never
    : never

type HandleOther<T> = "other" extends T ? Exclude<T, "other"> | OtherString : T

type KeepAndMerge<T extends object> = T | MergeTypeUnion<T>

type KeysFromUnion<T> = T extends T ? keyof T : never

type SimpleTypeMerge<T, K extends keyof any> = T extends {
    [k in K]?: any
}
    ? T[K] extends OtherString
        ? string & {}
        : T[K]
    : never

type MergeTypeUnion<T extends object> = {
    [k in KeysFromUnion<T>]: SimpleTypeMerge<T, k>
}

type EscapeLike = `'${"{" | "}" | "<" | ">"}`

type StripEscapes<T> = T extends `${infer Left}''${infer Right}`
    ? `${Left}${Right}`
    : T extends `${infer Start}${EscapeLike}${string}'${infer End}`
      ? `${Start}${StripEscapes<End>}`
      : T extends `${infer Start}${EscapeLike}${string}`
        ? Start
        : T

type GetArgs<T> = Flatten<TupleParseBlock<FindBlocks<StripEscapes<T>>>>

type TagName<T> = T extends `/${infer N}`
    ? TagName<N>
    : T extends `${infer N} ${string}`
      ? TagName<N>
      : T extends `${infer N}/`
        ? TagName<N>
        : T

type GetTags<S> = S extends `${string}<${infer T}>${infer Rest}`
    ? TagName<T> | GetTags<Rest>
    : never

export type { GetArgs, GetTags }
