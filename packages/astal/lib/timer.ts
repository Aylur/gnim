import GLib from "gi://GLib?version=2.0"
import { JSObject, Object, register, signal, VoidType } from "gnim/gobject"
import { type Accessor, createAccessor } from "gnim"
import { execAsync } from "./process.js"

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Timer {
    export interface SignalSignatures extends Object.SignalSignatures {
        now: Timer["now"]
        cancelled: Timer["cancelled"]
    }
}

/**
 * GObject-based timer that emits signals on ticks and cancellations.
 */
@register
export class Timer extends Object {
    declare $signals: Timer.SignalSignatures

    @signal([], VoidType, { default: false })
    protected now(): void {}

    @signal([], VoidType, { default: false })
    protected cancelled(): void {}

    /**
     * Create a timer that executes immediately and then repeatedly at a fixed interval.
     *
     * @param interval Time between ticks in milliseconds
     * @param callback Callback to execute on each tick
     *
     * @example
     * ```ts
     * const timer = Timer.interval(1000, () => {
     *   console.log("tick")
     * })
     *
     * timer.cancel()
     * ```
     */
    static interval(interval: number, callback?: () => void) {
        const timer = Timer.create(callback, () => {
            if (immediate.is_destroyed()) immediate.destroy()
            if (source.is_destroyed()) source.destroy()
        })
        const immediate = setTimeout(() => timer.now())
        const source = setInterval(() => timer.now(), interval)
        return timer
    }

    /**
     * Create a timer that executes once after a delay.
     *
     * @param interval Delay in milliseconds before the callback is executed
     * @param callback Callback to execute after the delay
     *
     * @example
     * ```ts
     * const timer = Timer.timeout(1000, () => {
     *   console.log("done")
     * })
     *
     * timer.cancel()
     * ```
     */
    static timeout(interval: number, callback?: () => void) {
        const timer = Timer.create(callback, () => {
            if (source.is_destroyed()) source.destroy()
        })
        const source = setTimeout(() => timer.now(), interval)
        return timer
    }

    /**
     * Create a timer that executes once when the event loop is idle.
     *
     * @param callback Callback to execute when idle
     *
     * @example
     * ```ts
     * const timer = Timer.idle(() => {
     *   console.log("idle")
     * })
     *
     * timer.cancel()
     * ```
     */
    static idle(callback?: () => void) {
        const timer = Timer.create(callback, () => {
            if (source.is_destroyed()) source.destroy()
        })
        const source = setTimeout(() => timer.now())
        return timer
    }

    private static create(onTick?: () => void, onCancelled?: () => void) {
        const timer = new Timer()
        const now = timer.connect("now", () => void onTick?.())
        const cancelled = timer.connect("cancelled", () => {
            timer.disconnect(now)
            timer.disconnect(cancelled)
            onCancelled?.()
        })
        return timer
    }

    /**
     * Cancel the timer and emit the `cancelled` signal.
     */
    cancel() {
        this.cancelled()
    }
}

export const { interval, timeout, idle } = Timer

/**
 * Create an Accessor that polls at a fixed interval by executing a command.
 * The polling starts when the first observer appears and stops when
 * the number of observers drops to zero.
 *
 * @param init Initial placeholder value
 * @param interval Polling interval in milliseconds
 * @param exec The command to execute
 *
 * @see execAsync
 *
 * @example
 * ```ts
 * const date = createPoll("", 1000, "date")
 *
 * effect(() => {
 *   console.log(date())
 * })
 * ```
 */
export function createPoll(
    init: string,
    interval: number,
    exec: string | string[],
): Accessor<string>

/**
 * Create an Accessor that polls at a fixed interval by executing a command
 * and transforming its output.
 * The polling starts when the first observer appears and stops when
 * the number of observers drops to zero.
 *
 * @param init Initial placeholder value
 * @param interval Polling interval in milliseconds
 * @param exec The command to execute
 * @param transform Function to transform the command's stdout
 *
 * @see execAsync
 *
 * @example
 * ```ts
 * const uptime = createPoll(0, 1000, "cat /proc/uptime", (stdout) => {
 *   return parseFloat(stdout.split(" ")[0])
 * })
 *
 * effect(() => {
 *   console.log("uptime:", uptime())
 * })
 * ```
 */
export function createPoll<T>(
    init: T,
    interval: number,
    exec: string | string[],
    transform: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T>

/**
 * Create an Accessor that polls at a fixed interval by calling a function.
 * The polling starts when the first observer appears and stops when
 * the number of observers drops to zero.
 *
 * @param init Initial placeholder value
 * @param interval Polling interval in milliseconds
 * @param fn Function to compute the new value
 *
 * @example
 * ```ts
 * const time = createPoll(Date.now(), 1000, () => Date.now())
 *
 * effect(() => {
 *   console.log(new Date(time()).toLocaleTimeString())
 * })
 * ```
 */
export function createPoll<T>(
    init: T,
    interval: number,
    fn: (prev: T) => T | Promise<T>,
): Accessor<T>

export function createPoll<T>(
    init: T,
    ival: number,
    execOrFn: string | string[] | ((prev: T) => T | Promise<T>),
    transform?: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T> {
    let currentValue = init
    let timer: GLib.Source | null = null
    const subscribers = new Set<() => void>()

    function set(value: T) {
        if (!JSObject.is(currentValue, value)) {
            currentValue = value
            Array.from(subscribers).forEach((cb) => cb())
        }
    }

    function compute() {
        if (typeof execOrFn === "function") {
            const value = execOrFn(currentValue)
            if (value instanceof Promise) {
                value.then(set).catch(console.error)
            } else {
                set(value)
            }
        } else {
            execAsync(execOrFn)
                .then((stdout) => {
                    const value = transform ? transform(stdout, currentValue) : (stdout as T)
                    if (value instanceof Promise) {
                        value.then(set).catch((err) => {
                            if (err instanceof Error || err instanceof GLib.Error) {
                                console.error(err)
                            } else {
                                console.error(new Error(err))
                            }
                        })
                    } else {
                        set(value)
                    }
                })
                .catch((err: string) => console.error(new Error(err)))
        }
    }

    function subscribe(callback: () => void): () => void {
        if (subscribers.size === 0) {
            setTimeout(compute)
            timer = setInterval(compute, ival)
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0 && timer) {
                clearInterval(timer)
                timer = null
            }
        }
    }

    return createAccessor(() => currentValue, subscribe)
}
