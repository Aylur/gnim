import GObject from "gi://GObject?version=2.0"

export class Fragment<T = any> extends GObject.Object {
    declare $signals: GObject.Object.SignalSignatures & {
        append(child: T): void
        remove(child: T): void
    }

    declare $readableProperties: GObject.Object.ReadableProperties & {
        children: T[]
    }

    static [GObject.signals] = {
        append: { param_types: [GObject.TYPE_OBJECT] },
        remove: { param_types: [GObject.TYPE_OBJECT] },
    }

    static [GObject.properties] = {
        children: GObject.ParamSpec.jsobject("children", "", "", GObject.ParamFlags.READABLE),
    }

    static {
        GObject.registerClass(this)
    }

    *[Symbol.iterator]() {
        yield* this._children
    }

    private _children: Array<T>

    append(this: Fragment<T>, child: T): void {
        if (child instanceof Fragment) {
            throw Error(`nesting Fragments are not yet supported`)
        }

        this._children.push(child)
        this.emit("append", child)
        this.notify("children")
    }

    remove(this: Fragment<T>, child: T): void {
        const index = this._children.findIndex((i) => i === child)

        this._children.splice(index, 1)
        this.emit("remove", child)
        this.notify("children")
    }

    constructor({ children = [] }: Partial<{ children: Array<T> | T }> = {}) {
        super()
        this._children = Array.isArray(children) ? children : [children]
    }
}
