import Gettext from "gettext"
import { type JSX, type GnimNode, resolveNode } from "../jsx/element"

const { fromEntries, entries } = Object

declare const slots: unique symbol
declare const tags: unique symbol

export type Text<T> = T & {
    [slots]: TemplateStrings<T>
    [tags]: Tags<T>
}

type TemplateStrings<S> = S extends `${infer _}{{${infer K}}}${infer Rest}`
    ? K | TemplateStrings<Rest>
    : never

type TagName<T> = T extends `/${infer N}`
    ? TagName<N>
    : T extends `${infer N} ${string}`
      ? TagName<N>
      : T extends `${infer N}/`
        ? TagName<N>
        : T

type Tags<S> = S extends `${string}<${infer T}>${infer Rest}` ? TagName<T> | Tags<Rest> : never

type AstNode = { type: "text"; value: string } | { type: "el"; name: string; children: AstNode[] }

export interface GettextDomain {
    <const S extends string>(msgid: S): Text<S>
    gettext<const S extends string>(msgid: S): Text<S>
    ngettext<const S1 extends string, const S2 extends string>(
        msgid1: S1,
        msgid2: S2,
        n: number,
    ): Text<S1 | S2>
    pgettext<const S extends string>(msgctxt: string, msgid: S): Text<S>
}

export function createDomain(domain?: null | string | Gettext.GettextDomain): GettextDomain {
    if (typeof domain === "string") {
        domain = Gettext.domain(domain)
    }
    if (!domain) {
        domain = Gettext.domain(null as unknown as string)
    }

    const { gettext } = domain
    function t(msgid: string) {
        return gettext(msgid)
    }

    return Object.assign(t, domain) as GettextDomain
}

function parseToAst(input: string): AstNode[] {
    const root: AstNode = { type: "el", name: "__root__", children: [] }
    const stack: Array<{ name: string; children: AstNode[] }> = [root]

    const tagRe = /<\s*\/?\s*([a-zA-Z0-9]+)[^>]*?>/g

    let lastIdx = 0
    let m: RegExpExecArray | null

    const peek = () => stack[stack.length - 1]

    const pushText = (s: string) => s && peek().children.push({ type: "text", value: s })

    while ((m = tagRe.exec(input))) {
        const full = m[0]
        const rawName = m[1]
        const name = rawName.toLowerCase()

        pushText(input.slice(lastIdx, m.index))
        lastIdx = m.index + full.length

        const isClosing = /^<\s*\//.test(full)
        const isSelfClosing = /\/\s*>$/.test(full)

        if (isClosing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].name === name) {
                    const node = stack.pop()!
                    peek().children.push({
                        type: "el",
                        name: node.name,
                        children: node.children,
                    })
                    break
                }
            }
        } else if (isSelfClosing) {
            peek().children.push({ type: "el", name, children: [] })
        } else {
            stack.push({ name, children: [] })
        }
    }

    // trailing text
    pushText(input.slice(lastIdx))

    // close any still-open tags
    while (stack.length > 1) {
        const node = stack.pop()!
        peek().children.push({
            type: "el",
            name: node.name,
            children: node.children,
        })
    }

    return root.children
}

type Prettify<T> = { [K in keyof T]: T[K] } & {}

type SlotsOnly<S> = S extends {
    [slots]: any
    [tags]: any
}
    ? [S[typeof slots], S[typeof tags]] extends [string, never]
        ? Record<S[typeof slots], string | number>
        : never
    : never

type Values<S> = S extends {
    [slots]: any
    [tags]: any
}
    ? [S[typeof slots], S[typeof tags]] extends [never, never]
        ? never
        : Prettify<
              Record<S[typeof slots], string | number> &
                  Record<S[typeof tags], (content: GnimNode) => GnimNode>
          >
    : never

function format<S extends string>(input: Text<S>, values: Values<Text<S>> | SlotsOnly<Text<S>>) {
    const slots = fromEntries(
        entries(values).filter(
            (v): v is [string, string | number] =>
                typeof v[1] === "string" || typeof v[1] === "number",
        ),
    )

    const tags = fromEntries(
        entries(values).filter(
            (v): v is [string, (content: GnimNode) => GnimNode] => typeof v[1] === "function",
        ),
    )

    const text = input.replace(
        /\{\{([^{}]+)\}\}/g,
        (match, key: string) => `${slots[key] ?? match}`,
    )

    const nodes = parseToAst(text)

    return { tags, nodes }
}

function renderString(nodes: AstNode[]): string[] {
    return nodes.map((n) => (n.type === "text" ? n.value : renderString(n.children).join("")))
}

function renderElements(
    nodes: AstNode[],
    fns: Record<string, (s: GnimNode) => GnimNode>,
): JSX.Element {
    return nodes.flatMap((n): GnimNode => {
        if (n.type === "text") {
            return [n.value]
        } else {
            const content = renderElements(n.children, fns)
            return [fns[n.name]?.(content) ?? content]
        }
    })
}

export function fmt<const S extends string>(input: Text<S>, slots: SlotsOnly<Text<S>>): string
export function fmt<const S extends string>(input: Text<S>, values: Values<Text<S>>): JSX.Element

export function fmt<const S extends string>(
    input: Text<S>,
    values: SlotsOnly<Text<S>> | Values<Text<S>>,
): string | JSX.Element {
    const { tags, nodes } = format(input, values)
    return entries(tags).length === 0
        ? renderString(nodes)
        : resolveNode(renderElements(nodes, tags))
}
