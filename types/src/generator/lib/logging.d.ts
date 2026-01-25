/// <reference path="./GLib-2.0.d.ts" />

import type GLib from "gi://GLib?version=2.0"

declare global {
    /**
     * Logs a message with severity equal to `GLib.LogLevelFlags.LEVEL_MESSAGE`.
     *
     * See also: {@link console.log}.
     *
     * @param message A string or any coercible value.
     */
    function log(message: any): void

    /**
     * Logs a stack trace for `error`, with an optional prefix, with severity equal to
     * {@link GLib.LogLevelFlags.LEVEL_WARNING}.
     *
     * See also: {@link console.trace}.
     *
     * @param error An `Error` or {@link GLib.Error} object.
     * @param prefix Optional prefix for the message.
     */
    function logError(error: Error | GLib.Error, prefix?: string): void

    /**
     * Takes any number of strings (or values that can be coerced to strings), joins them
     * with a space and appends a newline character (`\n`).
     *
     * The resulting string is printed directly to `stdout` of the current process with `g_print()`.
     *
     * @param messages Any number of strings or coercible values.
     */
    function print(...messages: any[]): void

    /**
     * Takes any number of strings (or values that can be coerced to strings), joins them
     * with a space and appends a newline character (`\n`).
     *
     * The resulting string is printed directly to `stderr` of the current process with `g_printerr()`.
     *
     * @param messages Any number of strings or coercible values.
     */
    function printerr(...messages: any[]): void
}
