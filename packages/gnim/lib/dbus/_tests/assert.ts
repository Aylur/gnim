import GObject from "gi://GObject?version=2.0"
import type { Keyof } from "../../util"

let passed = 0
const failures: string[] = []

function deepEq(a: unknown, b: unknown): boolean {
    if (Object.is(a, b)) return true
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((value, i) => deepEq(value, b[i]))
    }
    if (a && b && typeof a === "object" && typeof b === "object") {
        const keysA = Object.keys(a)
        const keysB = Object.keys(b)
        return (
            keysA.length === keysB.length &&
            keysA.every((key) =>
                deepEq((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
            )
        )
    }
    return false
}

export function assert(condition: boolean, message: string) {
    if (condition) {
        passed += 1
        print(`✓ ${message}`)
    } else {
        failures.push(message)
        print(`✗ ${message}`)
    }
}

export function assertEq(actual: unknown, expected: unknown, message: string) {
    if (deepEq(actual, expected)) {
        passed += 1
        print(`✓ ${message}`)
    } else {
        const detail = `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
        failures.push(`${message}: ${detail}`)
        print(`✗ ${message}: ${detail}`)
    }
}

export function assertThrows(fn: () => unknown, message: string) {
    try {
        fn()
        assert(false, `${message} (did not throw)`)
    } catch {
        assert(true, message)
    }
}

export async function assertRejects(promise: Promise<unknown>, message: string): Promise<unknown> {
    try {
        await promise
        assert(false, `${message} (resolved instead of rejecting)`)
        return null
    } catch (error) {
        assert(true, message)
        return error
    }
}

export function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

type SignalsOf<O> = O extends {
    $signals: infer S
    $readableProperties: infer P
}
    ? Keyof<Omit<S, "notify::{}">> | `notify::${Keyof<P>}`
    : never

/** resolves with the signal args (without the emitting object) or rejects on timeout */
export function expectSignal<O extends GObject.Object, S extends SignalsOf<O>>(
    object: O,
    signal: S,
    timeoutMs = 2000,
): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            object.disconnect(id)
            reject(Error(`timed out waiting for signal "${signal}"`))
        }, timeoutMs)
        const id = GObject.signal_connect(object, signal, (_source, ...args) => {
            clearTimeout(timer)
            object.disconnect(id)
            resolve(args)
        })
    })
}

/** prints a summary and returns the number of failed assertions */
export function report(side: string): number {
    print(`\n${side}: ${passed} passed, ${failures.length} failed`)
    for (const failure of failures) {
        print(`  ✗ ${failure}`)
    }
    return failures.length
}
