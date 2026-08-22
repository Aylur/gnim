import { render } from "./renderer.js"
import GObject from "gi://GObject?version=2.0"
import Gtk from "gi://Gtk?version=4.0"
import {
    appendChild,
    createRoot,
    createState,
    getScope,
    newObject,
    removeChild,
    type Accessor,
    type Buildable,
    type GnimNode,
    type Scope,
} from "gnim"
import { register } from "gnim/gobject"

export type Item<T extends GObject.Object> = Omit<Gtk.ListItem, "item" | "get_item"> & {
    item: T | null
    get_item(): T | null
}

export type Factory<T extends GObject.Object> = (item: Accessor<Item<T> | null>) => GnimNode

@register({ GTypeName: "GnimListItemFactoryChild" })
class ListItemFactoryChild<T extends GObject.Object> extends GObject.Object implements Buildable {
    setValue!: (value: Item<T> | null) => void
    teardown!: () => void
    child: Gtk.Widget | null = null

    constructor(scope: Scope, factory: Factory<T>) {
        super()

        createRoot((teardown) => {
            const [value, setValue] = createState<Item<T> | null>(null)
            this.setValue = setValue
            this.teardown = teardown
            render(() => factory(value), this)
        }, scope)
    }

    [appendChild](item: GObject.Object) {
        if (item instanceof Gtk.Widget) {
            this.child = item
            return true
        }
        return false
    }

    [removeChild](item: GObject.Object) {
        if (this.child === item) {
            this.child = null
            return true
        }
        return false
    }
}

function factoryHandler<T extends GObject.Object>(fn: (item: Item<T>) => void) {
    return function handler(_: Gtk.SignalListItemFactory, item: GObject.Object) {
        fn(item as Item<T>)
    }
}

export function createListItemFactory<T extends GObject.Object>(
    fn: Factory<T>,
): Gtk.ListItemFactory {
    const scope = getScope()
    const itemMap = new Map<Item<T>, ListItemFactoryChild<T>>()

    return newObject(Gtk.SignalListItemFactory, {
        onSetup: factoryHandler<T>((item) => {
            const child = new ListItemFactoryChild(scope, fn)
            item.child = child.child
            itemMap.set(item, child)
        }),
        onTeardown: factoryHandler<T>((item) => {
            itemMap.get(item)?.teardown()
            itemMap.delete(item)
        }),
        onBind: factoryHandler<T>((item) => {
            itemMap.get(item)?.setValue(item)
        }),
        onUnbind: factoryHandler<T>((item) => {
            itemMap.get(item)?.setValue(null)
        }),
    })
}
