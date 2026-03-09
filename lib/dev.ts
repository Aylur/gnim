import Gio from "gi://Gio?version=2.0"
import GLib from "gi://GLib?version=2.0"
import { jsx, type CC, type FC } from "./jsx/element.js"
import { computed, state, type State } from "./jsx/reactive.js"

function init(main: string) {
    const socketPath = GLib.getenv("GNIM_DEV_SOCK")
    if (!socketPath) throw Error("GNIM_DEV_SOCK is unset")

    const client = new Gio.SocketClient()
    const connection = client.connect(new Gio.UnixSocketAddress({ path: socketPath }), null)
    const input = new Gio.DataInputStream({ baseStream: connection.inputStream })

    function readLoop() {
        input.read_line_async(GLib.PRIORITY_DEFAULT, null, (_, res) => {
            const msg = input.read_line_finish_utf8(res)[0]
            if (!msg) throw Error("DEV server error")
            const [filepath, version] = msg.split(" ")
            if (main !== filepath) {
                import(`file://${filepath}?v=${version}`)
                    .catch((err) => {
                        print(`[dev] failed to update ${filepath} version=${version}: ${err}`)
                    })
                    .then(() => {
                        print(`[dev] updated ${filepath} version=${version}`)
                    })
            }
            readLoop()
        })
    }

    // TODO: when do I close these?
    // input.close(null)
    // connection.close(null)
    readLoop()
    import(`file://${main}`).catch(console.error)
}

type DevComponent = { impl: State<CC | FC>; ctx: unknown[] | null }
// const DevContext = createContext<unknown[] | null>(null)
const registry = new Map<string, DevComponent>()

function registerComponent(mod: string, name: string, impl: CC | FC): FC {
    if (typeof impl !== "function") return impl

    const path = GLib.uri_parse(mod, GLib.UriFlags.NONE).get_path()
    const id = path + ":" + name

    let entry = registry.get(id)

    if (!entry) {
        entry = { impl: state(impl), ctx: null }
        registry.set(id, entry)
    }

    const [get, set] = entry.impl
    set(() => impl)
    return (props) => computed(() => jsx(get(), props))
}

Object.assign(globalThis, { $$registerComponent: registerComponent })
const main = GLib.getenv("GNIM_ENTRY_MODULE")
if (!main) throw Error("GNIM_ENTRY_MODULE is unset")
init(main)
