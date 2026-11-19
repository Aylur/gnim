import GLib from "gi://GLib?version=2.0"
import system from "system"

type Fn = () => unknown
type Constructor = abstract new (...args: never[]) => unknown

interface Test {
    kind: "test"
    name: string
    fn: Fn
}

interface Suite {
    kind: "suite"
    name: string
    entries: Array<Test | Suite>
    beforeAll: Fn[]
    afterAll: Fn[]
}

interface Result {
    pass: boolean
    message: string
}

type Matcher = (actual: unknown, ...args: never[]) => Result

function createSuite(name: string): Suite {
    return { kind: "suite", name, entries: [], beforeAll: [], afterAll: [] }
}

const root = createSuite("")
const failures: string[] = []

let current: Suite | null = root
let passed = 0

const color = GLib.getenv("NO_COLOR") === null
const green = (text: string) => (color ? `\x1b[32m${text}\x1b[0m` : text)
const red = (text: string) => (color ? `\x1b[31m${text}\x1b[0m` : text)
const PASS = green("✓")
const FAIL = red("✗")

function currentSuite(caller: string): Suite {
    if (!current) throw new Error(`${caller}() cannot be called while tests are running`)
    return current
}

/** Groups tests under a name. The callback registers tests and has to be synchronous. */
export function describe(name: string, fn: () => void): void {
    const parent = currentSuite("describe")
    const suite = createSuite(name)
    parent.entries.push(suite)

    current = suite
    try {
        fn()
    } finally {
        current = parent
    }
}

/** Registers a test. Tests run one after another in the order they were registered. */
export function it(name: string, fn: Fn): void {
    currentSuite("it").entries.push({ kind: "test", name, fn })
}

export { it as test }

/** Runs `fn` once before the tests of the current suite. */
export function beforeAll(fn: Fn): void {
    currentSuite("beforeAll").beforeAll.push(fn)
}

/** Runs `fn` once after the tests of the current suite. */
export function afterAll(fn: Fn): void {
    currentSuite("afterAll").afterAll.push(fn)
}

export class AssertionError extends Error {
    name = "AssertionError"
}

function format(value: unknown): string {
    if (typeof value === "string") return JSON.stringify(value)
    if (typeof value === "bigint") return `${value}n`
    if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`
    if (value instanceof Error) return `${value.name}: ${value.message}`
    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
        return `${value.constructor.name} [${Array.from(value as unknown as ArrayLike<number>)}]`
    }
    try {
        return JSON.stringify(value) ?? String(value)
    } catch {
        return String(value)
    }
}

function equals(a: unknown, b: unknown, strict: boolean): boolean {
    if (Object.is(a, b)) return true
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false
    if (strict && Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

    if (ArrayBuffer.isView(a) || ArrayBuffer.isView(b)) {
        if (!ArrayBuffer.isView(a) || !ArrayBuffer.isView(b)) return false
        if (a.constructor !== b.constructor) return false
        const x = a as unknown as ArrayLike<unknown>
        const y = b as unknown as ArrayLike<unknown>
        return x.length === y.length && Array.from(x).every((value, i) => Object.is(value, y[i]))
    }

    if (Array.isArray(a) !== Array.isArray(b)) return false

    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    return (
        keysA.length === keysB.length &&
        keysA.every((key) =>
            equals(
                (a as Record<string, unknown>)[key],
                (b as Record<string, unknown>)[key],
                strict,
            ),
        )
    )
}

function throwMatcher(thrown: unknown, expected?: string | RegExp | Constructor): Result {
    const message = thrown instanceof Error ? thrown.message : String(thrown)

    if (typeof expected === "string") {
        return {
            pass: message.includes(expected),
            message: `error message ${format(message)} to include ${format(expected)}`,
        }
    }
    if (expected instanceof RegExp) {
        return {
            pass: expected.test(message),
            message: `error message ${format(message)} to match ${expected}`,
        }
    }
    if (typeof expected === "function") {
        return {
            pass: thrown instanceof expected,
            message: `${format(thrown)} to be an instance of ${expected.name}`,
        }
    }
    return { pass: true, message: "to throw" }
}

const matchers = {
    toBe: (actual: unknown, expected: unknown) => ({
        pass: Object.is(actual, expected),
        message: `${format(actual)} to be ${format(expected)}`,
    }),
    toEqual: (actual: unknown, expected: unknown) => ({
        pass: equals(actual, expected, false),
        message: `${format(actual)} to equal ${format(expected)}`,
    }),
    toStrictEqual: (actual: unknown, expected: unknown) => ({
        pass: equals(actual, expected, true),
        message: `${format(actual)} to strictly equal ${format(expected)}`,
    }),
    toBeNull: (actual: unknown) => ({
        pass: actual === null,
        message: `${format(actual)} to be null`,
    }),
    toBeTruthy: (actual: unknown) => ({
        pass: Boolean(actual),
        message: `${format(actual)} to be truthy`,
    }),
    toBeFalsy: (actual: unknown) => ({
        pass: !actual,
        message: `${format(actual)} to be falsy`,
    }),
    toBeInstanceOf: (actual: unknown, expected: Constructor) => ({
        pass: actual instanceof expected,
        message: `${format(actual)} to be an instance of ${expected.name}`,
    }),
    toBeGreaterThan: (actual: unknown, expected: number) => ({
        pass: typeof actual === "number" && actual > expected,
        message: `${format(actual)} to be greater than ${expected}`,
    }),
    toBeLessThan: (actual: unknown, expected: number) => ({
        pass: typeof actual === "number" && actual < expected,
        message: `${format(actual)} to be less than ${expected}`,
    }),
    toContain: (actual: unknown, expected: unknown) => ({
        pass:
            (typeof actual === "string" && actual.includes(String(expected))) ||
            (Array.isArray(actual) && actual.includes(expected)),
        message: `${format(actual)} to contain ${format(expected)}`,
    }),
    toHaveLength: (actual: unknown, expected: number) => {
        const length = (actual as { length?: unknown } | null)?.length
        return {
            pass: length === expected,
            message: `${format(actual)} to have length ${expected}`,
        }
    },
    toMatch: (actual: unknown, expected: string | RegExp) => ({
        pass:
            typeof actual === "string" &&
            (typeof expected === "string" ? actual.includes(expected) : expected.test(actual)),
        message: `${format(actual)} to match ${format(expected)}`,
    }),
    toThrow: (actual: unknown, expected?: string | RegExp | Constructor) => {
        if (typeof actual !== "function") {
            return { pass: false, message: `${format(actual)} to be a function` }
        }
        try {
            actual()
        } catch (error) {
            return throwMatcher(error, expected)
        }
        return { pass: false, message: `${format(actual)} to throw` }
    },
} satisfies Record<string, Matcher>

type Matchers = typeof matchers
type Args<M> = M extends (actual: unknown, ...args: infer A) => Result ? A : never
type Assertions<R> = { [K in keyof Matchers]: (...args: Args<Matchers[K]>) => R }

export type Expectation = Assertions<void> & {
    /** Inverts the following matcher. */
    not: Assertions<void>
    /** Awaits the promise and applies the following matcher to its value. */
    resolves: Assertions<Promise<void>>
    /** Awaits the promise and applies the following matcher to its rejection reason. */
    rejects: Assertions<Promise<void>>
}

function assertions<R>(apply: (name: keyof Matchers, args: unknown[]) => R): Assertions<R> {
    const entries = Object.keys(matchers).map((name) => [
        name,
        (...args: unknown[]) => apply(name as keyof Matchers, args),
    ])
    return Object.fromEntries(entries)
}

function check(name: keyof Matchers, actual: unknown, args: unknown[], negated: boolean) {
    const matcher = matchers[name] as (actual: unknown, ...args: unknown[]) => Result
    const result = matcher(actual, ...args)
    if (result.pass === negated) {
        throw new AssertionError(`expected ${negated ? "not " : ""}${result.message}`)
    }
}

/**
 * Creates an assertion for `actual`, modelled after
 * [vitest's expect](https://vitest.dev/api/expect).
 */
export function expect(actual: unknown): Expectation {
    return {
        ...assertions((name, args) => check(name, actual, args, false)),
        not: assertions((name, args) => check(name, actual, args, true)),
        resolves: assertions(async (name, args) => {
            let value: unknown
            try {
                value = await actual
            } catch (error) {
                throw new AssertionError(
                    `expected promise to resolve, rejected with ${format(error)}`,
                )
            }
            check(name, value, args, false)
        }),
        rejects: assertions(async (name, args) => {
            let reason: unknown
            try {
                await actual
            } catch (error) {
                reason = error
                if (name === "toThrow") {
                    const result = throwMatcher(reason, args[0] as string | RegExp | Constructor)
                    if (!result.pass) throw new AssertionError(`expected ${result.message}`)
                    return
                }
                check(name, reason, args, false)
                return
            }
            throw new AssertionError("expected promise to reject")
        }),
    }
}

function describeError(error: unknown): string {
    if (error instanceof AssertionError) return error.message
    if (error instanceof Error) {
        logError(error)
        return `${error.name}: ${error.message}`
    }
    return String(error)
}

async function runHooks(hooks: Fn[], label: string, path: string, indent: string) {
    for (const hook of hooks) {
        try {
            await hook()
        } catch (error) {
            const message = describeError(error)
            failures.push(`${path}${label}: ${message}`)
            print(`${indent}${FAIL} ${label}: ${message}`)
            return false
        }
    }
    return true
}

async function runSuite(suite: Suite, path: string, depth: number) {
    const indent = "  ".repeat(depth)

    if (suite.name) print(`${"  ".repeat(depth - 1)}${suite.name}`)

    if (await runHooks(suite.beforeAll, "beforeAll", path, indent)) {
        for (const entry of suite.entries) {
            if (entry.kind === "suite") {
                await runSuite(entry, `${path}${entry.name} > `, depth + 1)
                continue
            }

            try {
                await entry.fn()
                passed += 1
                print(`${indent}${PASS} ${entry.name}`)
            } catch (error) {
                const message = describeError(error)
                failures.push(`${path}${entry.name}: ${message}`)
                print(`${indent}${FAIL} ${entry.name}\n${indent}    ${message}`)
            }
        }
    }

    await runHooks(suite.afterAll, "afterAll", path, indent)
}

/**
 * Runs every registered test, prints a summary and exits the process
 * with a non-zero code if anything failed.
 */
export async function run(): Promise<never> {
    current = null
    await runSuite(root, "", 0)

    const failed = `${failures.length} failed`
    print(`\n${green(`${passed} passed`)}, ${failures.length > 0 ? red(failed) : failed}`)
    for (const failure of failures) print(`  ${FAIL} ${failure}`)
    system.exit(failures.length > 0 ? 1 : 0)
}
