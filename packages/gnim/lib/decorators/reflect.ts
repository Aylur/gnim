import type GObject from "gi://GObject?version=2.0"

type Type = { $gtype: GObject.GType }

type Meta = {
    type?: Type
    paramtypes?: Type[]
    returntype?: Type
}

export const decoratorMetadata = new WeakMap<GObject.Object, Record<string, Meta>>()

Object.assign(Reflect, {
    metadata(k: "design:type" | "design:paramtypes" | "design:returntype", value: unknown) {
        return (proto: GObject.Object, key: string) => {
            const record = decoratorMetadata.get(proto) ?? {}
            const meta = record[key] ?? {}

            switch (k) {
                case "design:type":
                    meta.type = value as Type
                    break
                case "design:paramtypes":
                    meta.paramtypes = value as Type[]
                    break
                case "design:returntype":
                    meta.returntype = value as Type
                    break
            }

            record[key] = meta
            decoratorMetadata.set(proto, record)
        }
    },
})
