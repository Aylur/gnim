import GObject from "gi://GObject"

export default class Fragment<T = any> extends GObject.Object {
    static [GObject.signals] = {
        "child-added": {
            param_types: [GObject.TYPE_OBJECT, GObject.TYPE_UINT],
        },
        "child-removed": {
            param_types: [GObject.TYPE_OBJECT, GObject.TYPE_UINT],
        },
    }

    static [GObject.properties] = {
        children: GObject.ParamSpec.jsobject("children", "", "", GObject.ParamFlags.READABLE),
    }

    static {
        GObject.registerClass(this)
    }

    static new<T>(children: Array<T> = []) {
        return new Fragment({ children })
    }

    private _children: Array<{ $: T }>

    get children() {
        return this._children.map(({ $ }) => $)
    }

    addChild(child: T, index: number = -1) {
        if (child instanceof Fragment) {
            throw Error(`nesting Fragments not yet supported`)
        }

        if (index > 0) {
            this._children = [
                ...this._children.slice(0, index),
                { $: child },
                ...this._children.slice(index),
            ]
        } else {
            this._children.push({ $: child })
            index = this._children.length - 1
        }

        this.emit("child-added", child, index)
        this.notify("children")
    }

    removeChild(child: T) {
        const index = this._children.findIndex(({ $ }) => $ === child)
        this._children.splice(index, 1)

        this.emit("child-removed", child, index)
        this.notify("children")
    }

    constructor({ children = [] }: Partial<{ children: Array<T> | T }> = {}) {
        super()
        this._children = Array.isArray(children) ? children.map(($) => ({ $ })) : [{ $: children }]
    }
}
