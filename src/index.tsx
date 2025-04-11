import Gtk from "gi://Gtk?version=4.0"
import GLib from "gi://GLib"
import { For } from "./gtk4"
import { State } from "./state"
import { register } from "./gobject"
Gtk.init()

@register({ Implements: [Gtk.Buildable] })
class Box extends Gtk.Box {
    append(child: Gtk.Widget): void {
        super.append(child)
    }

    vfunc_add_child(_: Gtk.Builder, child: any, type?: string | null) {
        super.vfunc_add_child(_, child, type)
    }
}

const Test = () => {
    const array = new State([{ value: 1 }])

    const remove = () => {
        array.set(array.get().slice(0, -1))
    }

    const add = () => {
        array.set([...array.get(), { value: array.get().length + 1 }])
    }

    return (
        <Gtk.Box>
            <Gtk.Button label="remove" $clicked={remove} />
            <Gtk.Box>
                <For each={array()} cleanup={() => {}}>
                    {(item, index) => <Gtk.Label label={index.as((i) => `${item.value}`)} />}
                </For>
            </Gtk.Box>
            <Gtk.Button label="add" $clicked={add} />
        </Gtk.Box>
    )
}

function App() {
    let value = 0
    const state = new State([{ value }])

    state.subscribe((l) => console.log(l.length))

    const add = () => {
        state.set([...state.get(), { value: ++value }])
    }

    const remove = () => {
        state.set(state.get().slice(0, -1))
    }

    return (
        <Gtk.Window visible>
            <Test />
        </Gtk.Window>
    )
}

App()

GLib.MainLoop.new(null, false).runAsync()
