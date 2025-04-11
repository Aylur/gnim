import GObject from "gi://GObject"
import { registerDestroyableType } from "../gnome/signalTracker"

export default class Fragment<T = any> extends GObject.Object {
    static [GObject.signals] = {
        destroy: {},

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
        registerDestroyableType(this)
    }

    static new<T>(children: Array<T> = []) {
        return new Fragment({ children })
    }

    private connectionIds = new Set<number>()
    private _children: Array<T>

    get children() {
        return [...this._children]
    }

    addChild(child: T, index: number = -1) {
        if (child instanceof Fragment) {
            throw Error(`nesting Fragments not yet supported`)
        }

        if (index > 0) {
            this._children = [
                ...this._children.slice(0, index),
                child,
                ...this._children.slice(index),
            ]
        } else {
            this._children.push(child)
            index = this._children.length - 1
        }

        this.emit("child-added", child, index)
        this.notify("children")
    }

    removeChild(child: T) {
        const index = this._children.findIndex((i) => i === child)
        this._children.splice(index, 1)

        this.emit("child-removed", child, index)
        this.notify("children")
    }

    constructor({ children = [] }: Partial<{ children: Array<T> | T }> = {}) {
        super()
        this._children = Array.isArray(children) ? children : [children]
    }

    connect(signal: string, callback: (_: this, ...args: any[]) => void): number {
        const id = super.connect(signal, callback)
        this.connectionIds.add(id)
        return id
    }

    disconnect(id: number): void {
        super.disconnect(id)
        this.connectionIds.delete(id)
    }

    destroy() {
        for (const id of this.connectionIds.values()) {
            super.disconnect(id)
        }

        this.emit("destroy")
    }
}
