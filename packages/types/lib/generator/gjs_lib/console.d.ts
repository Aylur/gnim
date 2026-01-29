/// <reference path="./GLib-2.0.d.ts" />

import type GLib from "gi://GLib?version=2.0"

declare global {
    /**
     * GJS implements the [WHATWG Console][https://console.spec.whatwg.org/] specification, with some
     * changes to accommodate GLib.
     *
     * In particular, log severity is mapped to {@link GLib.LogLevelFlags}
     * and some methods are not implemented:
     *
     * - `console.profile()`
     * - `console.profileEnd()`
     * - `console.timeStamp()`
     *
     * @version GJS 1.70
     */
    interface Console {
        /**
         * Logs a critical message if the condition is not truthy.
         *
         * See {@link console.error} for additional information.
         *
         * @param condition A boolean condition which, if `false`, causes the log to print.
         * @param data Formatting substitutions, if applicable.
         */
        assert(condition: boolean, ...data: any[]): void

        /**
         * Resets grouping and clears the terminal on systems supporting ANSI terminal
         * control sequences.
         *
         * In file-based stdout or systems which do not support clearing, `console.clear()`
         * has no visual effect.
         */
        clear(): void

        /**
         * Logs how many times `console.count()` has been called with the given `label`.
         * See {@link console.countReset} for resetting a count.
         *
         * @param label Optional label.
         */
        count(label?: string): void

        /**
         * Resets a counter used with {@link console.count}.
         *
         * @param label The unique label to reset the count for.
         */
        countReset(label: string): void

        /**
         * Logs a message with severity equal to {@link GLib.LogLevelFlags.LEVEL_DEBUG}
         *
         * @param data Formatting substitutions, if applicable.
         */
        debug(...data: any[]): void

        /**
         * Recursively display all properties of `item`.
         *
         * @param item The item to display.
         * @param options Additional options for the formatter. Unused in GJS.
         */
        dir(item: object, options?: never): void

        /**
         * Note: This is an alias for {@link console.log} in GJS.
         *
         * @param data Formatting substitutions, if applicable.
         */
        dirxml(...data: any[]): void

        /**
         * Logs a message with severity equal to {@link GLib.LogLevelFlags.LEVEL_CRITICAL}.
         *
         * Does not use {@link GLib.LogLevelFlags.LEVEL_ERROR} to avoid asserting and forcibly
         * shutting down the application.
         *
         * @param data Formatting substitutions, if applicable.
         */
        error(...data: any[]): void

        /**
         * Creates a new inline group in the console log, causing any subsequent console
         * messages to be indented by an additional level, until {@link console.groupEnd}
         * is called.
         *
         * @param data Formatting substitutions, if applicable.
         */
        group(...data: any[]): void

        /**
         * Note: This is an alias for {@link console.group} in GJS.
         *
         * @param data Formatting substitutions, if applicable.
         */
        groupCollapsed(...data: any[]): void

        /**
         * Exits the current inline group in the console log.
         */
        groupEnd(): void

        /**
         * Logs a message with severity equal to {@link GLib.LogLevelFlags.LEVEL_INFO}.
         *
         * @param data Formatting substitutions, if applicable.
         */
        info(...data: any[]): void

        /**
         * Logs a message with severity equal to {@link GLib.LogLevelFlags.LEVEL_MESSAGE}.
         *
         * @param data Formatting substitutions, if applicable.
         */
        log(...data: any[]): void

        /**
         * Note: This is an alias for {@link console.log} in GJS.
         *
         * @param tabularData Formatting substitutions, if applicable.
         * @param properties Unsupported in GJS.
         */
        table(tabularData?: any, properties?: undefined): void

        /**
         * Starts a timer you can use to track how long an operation takes.
         *
         * @param label Unique identifier for this action, pass to {@link console.timeEnd}
         * to complete.
         */
        time(label: string): void

        /**
         * Logs the time since the last call to {@link console.time} with the same `label`
         * and completes the action. Call {@link console.time} again to re-measure.
         *
         * @param label Unique identifier for this action.
         */
        timeEnd(label: string): void

        /**
         * Logs the time since the last call to {@link console.time} where `label` is the same.
         *
         * @param label Unique identifier for this action, pass to {@link console.timeEnd}
         * to complete.
         * @param data Formatting substitutions, if applicable.
         */
        timeLog(label: string, ...data: any[]): void

        /**
         * Outputs a stack trace to the console.
         *
         * @param data Formatting substitutions, if applicable.
         */
        trace(...data: any[]): void

        /**
         * Logs a message with severity equal to {@link GLib.LogLevelFlags.LEVEL_WARNING}.
         *
         * @param data Formatting substitutions, if applicable.
         */
        warn(...data: any[]): void
    }

    const console: Console
}
