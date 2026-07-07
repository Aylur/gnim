import GObject from "gi://GObject?version=2.0"

type Type = { $gtype: GObject.GType }

type Meta = {
    type?: Type
    paramtypes?: Type[]
    returntype?: Type
}

/**
 * Partial polyfill of https://github.com/tc39/proposal-decorator-metadata
 */
if (!("metadata" in Reflect)) {
    const decoratorMetadata = new WeakMap<GObject.Object, Map<string, Meta>>()

    function defineMetadata(
        metaKey: string,
        metaValue: unknown,
        proto: GObject.Object,
        key: string,
    ) {
        const record = decoratorMetadata.get(proto) ?? new Map()
        const meta = record.get(key) ?? {}

        // `void` will be passed as `undefined` explicitly
        if (typeof metaValue === "undefined") {
            metaValue ??= GObject.VoidType
        }

        switch (metaKey) {
            case "design:type":
                meta.type = metaValue as Type
                break
            case "design:paramtypes":
                meta.paramtypes = metaValue as Type[]
                break
            case "design:returntype":
                meta.returntype = metaValue as Type
                break
            default:
                break
        }

        record.set(key, meta)
        decoratorMetadata.set(proto, record)
    }

    function metadata(metaKey: string, metaValue: unknown) {
        return (proto: GObject.Object, key: string) => {
            defineMetadata(metaKey, metaValue, proto, key)
        }
    }

    function getMetadata(metaKey: string, proto: GObject.Object) {
        return decoratorMetadata.get(proto)?.get(metaKey)
    }

    Object.assign(Reflect, {
        metadata,
        defineMetadata,
        getMetadata,
    })
}

declare global {
    namespace Reflect {
        function getMetadata(metaKey: string, proto: GObject.Object): Meta | void
    }
}

export function getMetadata(proto: GObject.Object, metaKey: string) {
    return Reflect.getMetadata(metaKey, proto)
}
