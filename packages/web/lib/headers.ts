import Soup from "gi://Soup?version=3.0"

export type HeadersInit =
    Headers | Soup.MessageHeaders | Iterable<readonly [string, string]> | Record<string, string>

// RFC 9110 token
const NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const INVALID_VALUE = /[\0\r\n]/

function normalizeValue(value: string): string {
    return String(value).replace(/^[\t\n\r ]+|[\t\n\r ]+$/g, "")
}

function validate(name: string, value: string) {
    if (!NAME.test(name)) {
        throw new TypeError(`Headers: invalid header name "${name}"`)
    }
    if (INVALID_VALUE.test(value)) {
        throw new TypeError(`Headers: invalid value for header "${name}"`)
    }
}

// module private accessors used by Request and Response
let freeze: (headers: Headers) => void
let isFrozen: (headers: Headers) => boolean

/**
 * Implementation of the [Headers](https://developer.mozilla.org/docs/Web/API/Headers) web API.
 */
class Headers {
    #list: Array<[string, string]> = []
    #immutable = false

    static {
        freeze = (headers) => void (headers.#immutable = true)
        isFrozen = (headers) => headers.#immutable
    }

    constructor(init: HeadersInit = {}) {
        if (init instanceof Headers) {
            this.#list = init.#list.map(([name, value]) => [name, value])
        } else if (init instanceof Soup.MessageHeaders) {
            init.foreach((name, value) => {
                // servers can send headers that are not valid by the spec, skip them instead of failing
                try {
                    this.append(name, value)
                } catch {
                    return
                }
            })
        } else if (Symbol.iterator in init) {
            for (const pair of init) {
                if (pair.length !== 2) {
                    throw new TypeError("Headers: each header must have exactly two items")
                }
                this.append(pair[0], pair[1])
            }
        } else {
            for (const [name, value] of Object.entries(init)) {
                this.append(name, value)
            }
        }
    }

    #guard() {
        if (this.#immutable) throw new TypeError("Headers: headers are immutable")
    }

    /** Appends `value` to the values of `name`. */
    append(name: string, value: string): void {
        const v = normalizeValue(value)
        validate(name, v)
        this.#guard()
        this.#list.push([name.toLowerCase(), v])
    }

    /** Removes all values of `name`. */
    delete(name: string): void {
        validate(name, "")
        this.#guard()
        const key = name.toLowerCase()
        this.#list = this.#list.filter(([n]) => n !== key)
    }

    /** Returns the values of `name` joined by `", "`, or `null` when there are none. */
    get(name: string): string | null {
        validate(name, "")
        const key = name.toLowerCase()
        const values = this.#list.filter(([n]) => n === key).map(([, v]) => v)
        return values.length > 0 ? values.join(", ") : null
    }

    /** Returns the values of all `Set-Cookie` headers, which cannot be combined. */
    getSetCookie(): string[] {
        return this.#list.filter(([n]) => n === "set-cookie").map(([, v]) => v)
    }

    /** Whether there is a header named `name`. */
    has(name: string): boolean {
        validate(name, "")
        const key = name.toLowerCase()
        return this.#list.some(([n]) => n === key)
    }

    /** Replaces all values of `name` with `value`. */
    set(name: string, value: string): void {
        const v = normalizeValue(value)
        validate(name, v)
        this.#guard()

        const key = name.toLowerCase()
        const i = this.#list.findIndex(([n]) => n === key)
        if (i === -1) {
            this.#list.push([key, v])
        } else {
            this.#list[i] = [key, v]
            this.#list = this.#list.filter(([n], j) => j <= i || n !== key)
        }
    }

    /** Sorted and combined header list as defined by the spec. */
    #sorted(): Array<[string, string]> {
        const names = [...new Set(this.#list.map(([n]) => n))].sort()
        return names.flatMap((name): Array<[string, string]> =>
            name === "set-cookie"
                ? this.getSetCookie().map((value) => [name, value])
                : [[name, this.get(name)!]],
        )
    }

    forEach(
        callbackfn: (value: string, name: string, parent: Headers) => void,
        thisArg?: unknown,
    ): void {
        for (const [name, value] of this.#sorted()) {
            callbackfn.call(thisArg, value, name, this)
        }
    }

    *entries(): IterableIterator<[string, string]> {
        yield* this.#sorted()
    }

    *keys(): IterableIterator<string> {
        for (const [name] of this.#sorted()) yield name
    }

    *values(): IterableIterator<string> {
        for (const [, value] of this.#sorted()) yield value
    }

    [Symbol.iterator](): IterableIterator<[string, string]> {
        return this.entries()
    }

    get [Symbol.toStringTag](): string {
        return "Headers"
    }
}

export { freeze as freezeHeaders, isFrozen as isFrozenHeaders, Headers }
