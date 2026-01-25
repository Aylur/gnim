/// <reference path="./GLib-2.0.d.ts" />

import type GLib from "gi://GLib?version=2.0"

declare global {
    /**
     * Schedules a timeout to run `handler` every `timeout` milliseconds. Any `arguments`
     * are passed straight through to the `handler`.
     *
     * Note: In GJS, the returned value is not a `Number`, but a {@link GLib.Source}.
     *
     * @param handler The callback to invoke.
     * @param timeout Optional interval in milliseconds.
     * @param arguments Optional arguments to pass to `handler`.
     * @returns The identifier of the repeated action.
     * @version GJS 1.72
     */
    function setInterval<TArgs extends any[]>(
        handler: (...args: TArgs) => void,
        timeout?: number,
        ...arguments: TArgs
    ): GLib.Source

    /**
     * Cancels the timeout set with {@link setInterval} or {@link setTimeout} identified by `id`.
     *
     * @param id The identifier of the interval you want to cancel.
     * @version GJS 1.72
     */
    function clearInterval(id: GLib.Source): void

    /**
     * Schedules a timeout to run `handler` after `timeout` milliseconds. Any `arguments`
     * are passed straight through to the `handler`.
     *
     * Note: In GJS, the returned value is not a `Number`, but a {@link GLib.Source}.
     *
     * @param handler The callback to invoke.
     * @param timeout Optional timeout in milliseconds.
     * @param arguments Optional arguments to pass to `handler`.
     * @returns The identifier of the repeated action.
     * @version GJS 1.72
     */
    function setTimeout<TArgs extends any[]>(
        handler: (...args: TArgs) => void,
        timeout?: number,
        ...arguments: TArgs
    ): GLib.Source

    /**
     * Cancels the timeout set with {@link setTimeout} or {@link setInterval} identified by `id`.
     *
     * @param id The identifier of the timeout you want to cancel.
     * @version GJS 1.72
     */
    function clearTimeout(id: GLib.Source): void
}
