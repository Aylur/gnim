import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { createAccessor, type Accessor } from "gnim"
import { register, signal, VoidType, type ConstructorProps } from "gnim/gobject"

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Process {
    export interface SignalSignatures extends GObject.Object.SignalSignatures {
        stdout: Process["stdout"]
        stderr: Process["stderr"]
        exit: Process["exit"]
    }

    export interface ConstructOnlyProperties {
        argv: string[]
    }
}

/**
 * A simple abstraction over {@link Gio.Subprocess} which lets you run child processes.
 */
@register
export class Process extends GObject.Object {
    declare readonly $signals: Process.SignalSignatures
    declare readonly $constructOnlyProperties: Process.ConstructOnlyProperties

    @signal([String], VoidType, { default: false })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected stdout(_out: string): void {}

    @signal([String], VoidType, { default: false })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected stderr(_err: string): void {}

    @signal([Number, Boolean], VoidType, { default: false })
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    protected exit(_code: number, _signaled: boolean): void {}

    #encoder = new TextEncoder()
    #outStream: Gio.DataInputStream
    #errStream: Gio.DataInputStream
    #inStream: Gio.DataOutputStream
    #process: Gio.Subprocess

    #readStream(stream: Gio.DataInputStream) {
        stream.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            try {
                const [output] = stream.read_line_finish_utf8(res)
                if (output !== null) {
                    if (stream === this.#errStream) {
                        this.stderr(output.trim())
                    } else {
                        this.stdout(output.trim())
                    }
                    this.#readStream(stream)
                }
            } catch (error) {
                console.error(error)
            }
        })
    }

    /**
     * Force quit the subprocess.
     */
    kill(): void {
        this.#process.force_exit()
    }

    /**
     * Send a signal to the subprocess.
     *
     * @param signal Signal number to be sent
     */
    signal(signal: number): void {
        this.#process.send_signal(signal)
    }

    /**
     * Write a line to the subprocess' stdin synchronously.
     * See {@link Gio.DataOutputStream.prototype.write_bytes_async}
     *
     * @param str String to be written to stdin
     */
    write(str: string): Promise<[boolean, number]> {
        return new Promise((resolve, reject) => {
            this.#inStream.write_bytes_async(
                this.#encoder.encode(str),
                GLib.PRIORITY_DEFAULT,
                null,
                (_, res) => {
                    try {
                        resolve(this.#inStream.write_all_finish(res))
                    } catch (error) {
                        reject(error)
                    }
                },
            )
        })
    }

    /**
     * Write a line to the to stdin asynchronously.
     *
     * @param str String to be written to stdin
     */
    async writeAsync(str: string): Promise<void> {
        return new Promise((resolve, reject) => {
            this.#inStream.write_all_async(
                this.#encoder.encode(str),
                GLib.PRIORITY_DEFAULT,
                null,
                (_, res) => {
                    try {
                        resolve(void this.#inStream.write_all_finish(res))
                    } catch (error) {
                        reject(error)
                    }
                },
            )
        })
    }

    constructor({ argv }: ConstructorProps<Process>) {
        super()
        const process = (this.#process = Gio.Subprocess.new(
            argv,
            Gio.SubprocessFlags.STDIN_PIPE |
                Gio.SubprocessFlags.STDOUT_PIPE |
                Gio.SubprocessFlags.STDERR_PIPE,
        ))

        this.#inStream = Gio.DataOutputStream.new(process.get_stdin_pipe()!)
        this.#outStream = Gio.DataInputStream.new(process.get_stdout_pipe()!)
        this.#errStream = Gio.DataInputStream.new(process.get_stderr_pipe()!)

        this.#readStream(this.#outStream)
        this.#readStream(this.#errStream)

        process.wait_async(null, (_, res) => {
            try {
                process.wait_finish(res)
            } catch {
                // ignore
            }

            if (process.get_if_exited()) {
                this.exit(process.get_exit_status(), false)
            }

            if (process.get_if_signaled()) {
                this.exit(process.get_term_sig(), true)
            }
        })
    }

    /**
     * Start a new subprocess with the given command.
     * The first element of the vector is executed with the remaining
     * elements as the argument list.
     */
    static subprocessv(cmd: string[]) {
        return new Process({ argv: cmd })
    }

    /**
     * Start a new subprocess with the given command
     * which is parsed using {@link GLib.shell_parse_argv}.
     */
    static subprocess(cmd: string) {
        const [, argv] = GLib.shell_parse_argv(cmd)
        return Process.subprocessv(argv!)
    }

    /**
     * Execute a command synchronously.
     * The first element of the vector is executed with the remaining
     * elements as the argument list.
     *
     * @throws stderr
     * @return stdout of the subprocess
     */
    static execv(cmd: string[]) {
        const process = Gio.Subprocess.new(
            cmd,
            Gio.SubprocessFlags.STDERR_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
        )

        const [, out, err] = process.communicate_utf8(null, null)
        if (process.get_successful() && out) {
            return out.trim()
        } else if (err) {
            throw new Error(err.trim())
        } else {
            throw new Error("Unknown error")
        }
    }

    /**
     * Execute a command synchronously.
     * The command is parsed using {@link GLib.shell_parse_argv}.
     *
     * @throws stderr
     * @return stdout of the subprocess
     */
    static exec(cmd: string) {
        const [, argv] = GLib.shell_parse_argv(cmd)
        return Process.execv(argv!)
    }

    /**
     * Execute a command asynchronously.
     * The first element of the vector is executed with the remaining
     * elements as the argument list.
     *
     * @throws stderr
     * @return stdout of the subprocess
     */
    static execAsyncv(cmd: string[]): Promise<string> {
        const process = Gio.Subprocess.new(
            cmd,
            Gio.SubprocessFlags.STDERR_PIPE | Gio.SubprocessFlags.STDOUT_PIPE,
        )

        return new Promise((resolve, reject) => {
            process.communicate_utf8_async(null, null, (_, res) => {
                try {
                    const [, out, err] = process.communicate_utf8_finish(res)
                    if (process.get_successful() && out) {
                        return resolve(out.trim())
                    } else if (err) {
                        reject(new Error(err.trim()))
                    } else {
                        reject(new Error("Unknown error"))
                    }
                } catch (error) {
                    reject(error)
                }
            })
        })
    }

    /**
     * Execute a command asynchronously.
     * The command is parsed using {@link GLib.shell_parse_argv}.
     *
     * @throws stderr
     * @return stdout of the subprocess
     */
    static execAsync(cmd: string) {
        const [, argv] = GLib.shell_parse_argv(cmd)
        return Process.execAsyncv(argv!)
    }
}

type SubprocessArgs = {
    cmd: string | string[]
    out?: (stdout: string) => void
    err?: (stderr: string) => void
}

/**
 * Start long running child process.
 *
 * @example
 * ```ts
 * subprocess({
 *   cmd: "command",
 *   out: (stdout) => console.log(stdout),
 *   err: (stderr) => console.error(stderr),
 * })
 * ```
 */
export function subprocess(args: SubprocessArgs): Process

/**
 * Start long running child process.
 *
 * @example
 * ```ts
 * subprocess(
 *   "command",
 *   (stdout) => console.log(stdout),
 *   (stderr) => console.error(stderr),
 * )
 * ```
 */
export function subprocess(
    cmd: string | string[],
    onOut?: (stdout: string) => void,
    onErr?: (stderr: string) => void,
): Process

export function subprocess(
    argsOrCmd: SubprocessArgs | string | string[],
    onOut: (stdout: string) => void = print,
    onErr: (stderr: string) => void = printerr,
) {
    const args = Array.isArray(argsOrCmd) || typeof argsOrCmd === "string"
    const { cmd, err, out } = {
        cmd: args ? argsOrCmd : argsOrCmd.cmd,
        err: args ? onErr : argsOrCmd.err || onErr,
        out: args ? onOut : argsOrCmd.out || onOut,
    }

    const proc = Array.isArray(cmd) ? Process.subprocessv(cmd) : Process.subprocess(cmd)
    proc.connect("stdout", (_, stdout: string) => out(stdout))
    proc.connect("stderr", (_, stderr: string) => err(stderr))
    return proc
}

/**
 * Execute a command synchronously.
 * @throws stderr
 * @return stdout
 *
 * @example
 * ```ts
 * try {
 *   const stdout = exec("command")
 *   console.log(stdout)
 * } catch (stderr) {
 *   console.error(stderr)
 * }
 * ```
 */
export function exec(cmd: string | string[]) {
    return Array.isArray(cmd) ? Process.execv(cmd) : Process.exec(cmd)
}

/**
 * Execute a command asynchronously.
 * @throws stderr
 * @return stdout
 *
 * @example
 * ```ts
 * try {
 *   const stdout = await execAsync("command")
 *   console.log(stdout)
 * } catch (stderr) {
 *   console.error(stderr)
 * }
 * ```
 */
export function execAsync(cmd: string | string[]): Promise<string> {
    if (Array.isArray(cmd)) {
        return Process.execAsyncv(cmd)
    } else {
        return Process.execAsync(cmd)
    }
}

/**
 * Create an Accessor that starts the subprocess when the first observer appears
 * and kills the subprocess when number of observers drops to zero.
 * The subprocess is expected to never exit.
 *
 * @param init Placeholder value for stdout
 * @param exec The command to launch as a subprocess
 *
 * @example
 * ```ts
 * const stdout = createSubprocess("placeholder", ["command"])
 *
 * effec(() => {
 *   console.log("command printed a new line", stdout())
 * })
 * ```
 */
export function createSubprocess(init: string, exec: string | string[]): Accessor<string>

/**
 * Create an Accessor that starts the subprocess when the first observer appears
 * and kills the subprocess when number of observers drops to zero.
 * The subprocess is expected to never exit.
 *
 * @param init Placeholder value
 * @param exec The command to launch as a subprocess
 * @param transform The parser logic for the stdout
 *
 * @example
 * ```ts
 * const value = createSubprocess({}, ["command"], (stdout, prev) => {
 *   const json = JSON.parse(stdout)
 *   return json
 * })
 *
 * effec(() => {
 *   console.log(JSON.stringify(value()))
 * })
 * ```
 */
export function createSubprocess<T>(
    init: T,
    exec: string | string[],
    transform: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T>

export function createSubprocess<T>(
    init: T,
    exec: string | string[],
    transform?: (stdout: string, prev: T) => T | Promise<T>,
): Accessor<T> {
    let currentValue = init
    let proc: Process | null = null

    const subscribers = new Set<() => void>()

    function set(value: T) {
        if (!Object.is(currentValue, value)) {
            currentValue = value
            Array.from(subscribers).forEach((cb) => cb())
        }
    }

    function subscribe(callback: () => void): () => void {
        if (subscribers.size === 0) {
            proc = subprocess(exec, (stdout) => {
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
        }

        subscribers.add(callback)

        return () => {
            subscribers.delete(callback)
            if (subscribers.size === 0) {
                proc?.kill()
                proc = null
            }
        }
    }

    return createAccessor(() => currentValue, subscribe)
}
