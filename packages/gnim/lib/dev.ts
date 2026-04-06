import gi from "gi"
import Gettext from "gettext"
import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { jsx, resolveNode, type FC } from "./jsx/element.js"
import {
    computed,
    createContext,
    createState,
    devHooks,
    getScope,
    type State,
} from "./jsx/reactive.js"

const props = JSON.parse(GLib.getenv("GNIM_DEV")!) as {
    applicationId?: string
    verbose: boolean
    gtk?: "3.0" | "4.0"
    socket: string
    entry: string
    modules: Record<string, string>
    rundir: string
}

type SocketMsg = {
    source: string
    module: string
    version: number
}

let sourceCss: null | ((id: string, stylesheet: string) => void) = null

function initGtk() {
    if (props.gtk === "4.0") {
        gi.require("Gtk", "4.0").init()
    }
    if (props.gtk === "3.0") {
        // @ts-expect-error girgen should override init()
        gi.require("Gtk", "3.0").init(null)
    }
}

function initGettext() {
    if (props.applicationId) {
        const localedir = Gio.file_new_build_filenamev([props.rundir, "locale"])
        Gettext.bindtextdomain(props.applicationId, localedir.get_path()!)
    }
}

function initIcons() {
    const cwd = GLib.get_current_dir()
    const icondir = Gio.file_new_build_filenamev([cwd, "data", "icons"])

    if (props.gtk === "4.0") {
        const display = gi.require("Gdk", "4.0").Display.get_default()!
        gi.require("Gtk", "4.0")
            .IconTheme.get_for_display(display)
            .add_search_path(icondir.get_path()!)
    }

    if (props.gtk === "3.0") {
        gi.require("Gtk", "3.0").IconTheme.get_default().append_search_path(icondir.get_path()!)
    }
}

function initCss() {
    if (props.gtk === "4.0") {
        const Gtk = gi.require("Gtk", "4.0")
        const display = gi.require("Gdk", "4.0").Display.get_default()!
        const providers = new Map<string, InstanceType<typeof Gtk.CssProvider>>()
        sourceCss = function (id: string, stylesheet: string) {
            const provider = providers.get(id) ?? Gtk.CssProvider.new()
            provider.load_from_string(stylesheet)
            if (!providers.has(id)) {
                providers.set(id, provider)
                Gtk.StyleContext.add_provider_for_display(
                    display,
                    provider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
                )
            }
        }
    }

    if (props.gtk === "3.0") {
        const Gtk = gi.require("Gtk", "3.0")
        const screen = gi.require("Gdk", "3.0").Screen.get_default()!
        const providers = new Map<string, InstanceType<typeof Gtk.CssProvider>>()
        sourceCss = function (id: string, stylesheet: string) {
            const encoder = new TextEncoder()
            const provider = providers.get(id) ?? Gtk.CssProvider.new()
            provider.load_from_data(encoder.encode(stylesheet))
            if (!providers.has(id)) {
                providers.set(id, provider)
                Gtk.StyleContext.add_provider_for_screen(
                    screen,
                    provider,
                    Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION,
                )
            }
        }
    }

    if (sourceCss) {
        for (const [id, file] of Object.entries(props.modules)) {
            if (id.endsWith(".css")) {
                import(`file://${file}`)
                    .then((m) => {
                        if (typeof m.default === "string") {
                            sourceCss!(id, m.default)
                        }
                    })
                    .catch(console.error)
            }
        }
    }
}

function initSocket() {
    const client = new Gio.SocketClient()
    const connection = client.connect(new Gio.UnixSocketAddress({ path: props.socket }), null)
    const input = new Gio.DataInputStream({ baseStream: connection.inputStream })

    function readLoop() {
        input.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            const msg = input.read_line_finish_utf8(res)[0]
            if (!msg) throw Error("DEV internal server error")
            const { version, source, module: mod } = JSON.parse(msg) as SocketMsg

            if (props.entry !== mod && version > 0) {
                const file = `${mod}?v=${version}`
                if (props.verbose) printerr(`[dev] source ${file}`)
                import(`file://${file}`)
                    .then((m) => {
                        if (source.endsWith(".css")) {
                            sourceCss?.(source, m.default)
                        }
                    })
                    .catch(console.error)
            }

            readLoop()
        })
    }

    readLoop()
    // return () => {
    //     input.close(null)
    //     connection.close(null)
    // }
}

function overrideGObjectRegistration() {
    type Class = { [GObject.GTypeName]?: string; new (): GObject.Object }

    const register = GObject.registerClass
    const registry = new Map<string, number>()

    function getName(klass: Class) {
        const name =
            (GObject.GTypeName in klass && typeof klass[GObject.GTypeName] === "string"
                ? klass[GObject.GTypeName]
                : klass.name) || `anonymous_${GLib.uuid_string_random()}`

        return `Gjs_${name}`
    }

    function versionSuffix(name: string) {
        const v = (registry.get(name) ?? 0) + 1
        registry.set(name, v)
        return v > 1 ? `_HMR_${v}` : ""
    }

    function registerClass(...args: [Class] | [{ GTypeName?: string }, Class]) {
        if (args.length === 2) {
            const [meta, klass] = args
            if ("GTypeName" in meta && typeof meta.GTypeName === "string") {
                meta.GTypeName = meta.GTypeName + versionSuffix(meta.GTypeName)
            } else {
                const name = getName(klass)
                meta.GTypeName = name + versionSuffix(name)
            }

            return register(meta, klass)
        }

        const [klass] = args
        const name = getName(klass)
        return register({ GTypeName: name + versionSuffix(name) }, klass)
    }

    GObject.registerClass = registerClass
}

function initRegistry() {
    class StateCtx {
        private dirty = false
        private current: null | Array<{ init: unknown; current(): unknown }> = null
        private buffer = new Array<{ init: unknown; current(): unknown }>()

        push<T>(init: T, get: () => T): T {
            if (this.dirty) return init

            if (!this.current) {
                this.buffer.push({ init, current: get })
                return init
            }

            const state = this.current.shift()

            if (state && state.init === init) {
                this.buffer.push({ init, current: get })
                return state.current() as T
            }

            this.dirty = true
            return init
        }

        flush() {
            this.current = this.dirty ? null : this.buffer
            this.buffer = []
            this.dirty = false
        }
    }

    type DevComponent = { impl: State<FC>; state: StateCtx }

    const registry = new Map<string, DevComponent>()
    const stateCtx = createContext<StateCtx | null>(null)

    devHooks.createState = function (init, get) {
        return stateCtx.use()?.push(init, get) ?? init
    }

    function $$registerComponent(mod: string, name: string, impl: FC) {
        if (typeof impl !== "function") return impl
        if ("$$typeof" in impl && impl.$$typeof === "context") return impl

        const path = GLib.uri_parse(mod, GLib.UriFlags.NONE).get_path()
        const id = path + ":" + name

        let entry = registry.get(id)

        if (!entry) {
            entry = { impl: createState(impl), state: new StateCtx() }
            registry.set(id, entry)
        }

        const [get, set] = entry.impl
        set(() => impl)
        return function (props: any) {
            return computed(() => {
                getScope().contexts.set(stateCtx, entry.state)
                const node = resolveNode(jsx(get(), props))
                entry.state.flush()
                return node
            })
        }
    }

    Object.assign(globalThis, { $$registerComponent })
}

overrideGObjectRegistration()
initGtk()
initGettext()
initIcons()
initCss()
initRegistry()
initSocket()

import(`file://${props.entry}`).catch(console.error)
