declare namespace format {
    /**
     * Formats a string using printf-style format specifiers.
     *
     * @param str The format string
     * @param args The arguments to be formatted
     * @returns The formatted string
     */
    export function vprintf(
        str: string,
        args: (string | number | boolean | null | undefined)[],
    ): string

    /**
     * Prints a formatted string to the console.
     * Similar to C's printf function.
     *
     * @param fmt The format string
     * @param args The arguments to be formatted
     */
    export function printf(
        fmt: string,
        ...args: (string | number | boolean | null | undefined)[]
    ): void

    /**
     * Formats a string with the given arguments.
     * This is the implementation that backs String.prototype.format
     * when pkg.initFormat() is called.
     *
     * Supported format specifiers:
     * - %s: Formats as a string
     * - %d: Formats as an integer
     * - %x: Formats as a hexadecimal number
     * - %f: Formats as a floating point number, optionally with precision (e.g. %.2f)
     *
     * All specifiers can be prefixed with a minimum field width, e.g. "%5s" will pad with spaces.
     * If the width is prefixed with '0', it will pad with zeroes instead of spaces.
     *
     * @example
     * ```ts
     * format.format("Hello %s, you have %d items", "User", 5);
     * // Returns: "Hello User, you have 5 items"
     * ```
     *
     * @param fmt The format string
     * @param args The arguments to format the string with
     * @returns The formatted string
     */
    export function format(
        fmt: string,
        ...args: (string | number | boolean | null | undefined)[]
    ): string
}

export default format
