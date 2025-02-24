import GObject, { register, property, signal } from "../gobject.js"

@register({ GTypeName: "Fragment" })
export default class Fragment<T = any> extends GObject.Object {
    private _children: Array<{ $: T }>

    @property(Object)
    get children() {
        return this._children.map(({ $ }) => $)
    }

    set children(_: Array<T>) {
        // ignore
    }

    @signal(GObject.Object, GObject.TYPE_UINT)
    declare childAdded: (child: T, index: number) => void

    @signal(GObject.Object, GObject.TYPE_UINT)
    declare childRemoved: (child: T, index: number) => void

    addChild(child: T, index: number = -1) {
        if (child instanceof Fragment) {
            throw Error(`nesting Fragments not yet supported`)
        }

        if (index > 0) {
            this._children = [
                ...this._children.slice(0, index),
                { $: child },
                ...this._children.slice(index)
            ];
        } else {
            this._children.push({ $: child })
            index = this._children.length - 1
        }

        this.childAdded(child, index)
        this.notify("children")
    }

    removeChild(child: T) {
        const index = this._children.findIndex(({ $ }) => $ === child)
        this._children.splice(index, 1)

        this.childRemoved(child, index)
        this.notify("children")
    }

    constructor({ children = [] }: Partial<{ children: Array<T> | T }> = {}) {
        super()
        this._children = Array.isArray(children) ? children.map(($) => ({ $ })) : [{ $: children }]
    }

    static new<T>(children: Array<T> = []) {
        return new Fragment({ children })
    }
}
