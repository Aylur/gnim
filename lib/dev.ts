import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import { resolveNode, type FC } from "./jsx/element.js"
import { computed, state, type State } from "./jsx/reactive.js"

const verbose = GLib.getenv("GNIM_VERBOSE") === "true"
const entry = GLib.getenv("GNIM_ENTRY_MODULE")
const socket = GLib.getenv("GNIM_DEV_SOCK")

function initRegistry() {
    type DevComponent = { impl: State<FC> }
    const registry = new Map<string, DevComponent>()

    Object.assign(globalThis, {
        $$registerComponent(mod: string, name: string, impl: FC) {
            if ("$$typeof" in impl) return impl
            if (typeof impl !== "function") return impl

            const path = GLib.uri_parse(mod, GLib.UriFlags.NONE).get_path()
            const id = path + ":" + name

            let entry = registry.get(id)

            if (!entry) {
                entry = { impl: state(impl) }
                registry.set(id, entry)
            }

            const [get, set] = entry.impl
            set(() => impl)
            return (props: any) => computed(() => resolveNode(get()(props)))
        },
    })
}

function initSocket(path: string) {
    const client = new Gio.SocketClient()
    const connection = client.connect(new Gio.UnixSocketAddress({ path }), null)
    const input = new Gio.DataInputStream({ baseStream: connection.inputStream })

    function readLoop() {
        input.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            const msg = input.read_line_finish_utf8(res)[0]
            if (!msg) throw Error("DEV server error")
            const [filepath, version] = msg.split(" ")
            if (entry !== filepath) {
                if (verbose) printerr(`[dev] source ${filepath}?v=${version}`)
                import(`file://${filepath}?v=${version}`).catch(console.error)
            }
            readLoop()
        })
    }

    // TODO: when do I close these?
    // input.close(null)
    // connection.close(null)
    readLoop()
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

if (entry && socket) {
    initRegistry()
    initSocket(socket)
    overrideGObjectRegistration()
    import(`file://${entry}`).catch(console.error)
}
