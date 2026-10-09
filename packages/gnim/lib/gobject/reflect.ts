import GObject from "gi://GObject?version=2.0"

type Type = { $gtype: GObject.GType }

type Key = string | symbol

type Meta = {
    type?: Type
    paramtypes?: Type[]
    returntype?: Type
}

declare global {
    namespace Reflect {
        function defineMetadata(
            metadataKey: unknown,
            metadataValue: unknown,
            target: object,
            propertyKey?: Key,
        ): void
        function hasMetadata(metadataKey: unknown, target: object, propertyKey?: Key): boolean
        function getMetadata(metadataKey: unknown, target: object, propertyKey?: Key): unknown
        function metadata(
            metadataKey: unknown,
            metadataValue: unknown,
        ): (target: object, propertyKey?: Key) => void
    }
}

// @ts-expect-error let gnome-shell extensions disable it
if (!import.meta.GNIM_DISABLE_GLOBAL_OVERRIDES) {
    /**
     * Partial polyfill of https://github.com/tc39/proposal-decorator-metadata
     */
    if (!("metadata" in Reflect)) {
        const store = new WeakMap<object, Map<Key | undefined, Map<unknown, unknown>>>()

        const defineMetadata: typeof Reflect.defineMetadata = (
            metadataKey,
            metadataValue,
            target,
            propertyKey,
        ) => {
            const targetMetadata = store.get(target) ?? new Map()
            const propertyMetadata = targetMetadata.get(propertyKey) ?? new Map()
            propertyMetadata.set(metadataKey, metadataValue)
            targetMetadata.set(propertyKey, propertyMetadata)
            store.set(target, targetMetadata)
        }

        const hasMetadata: typeof Reflect.hasMetadata = (metadataKey, target, propertyKey) => {
            for (let t: object | null = target; t !== null; t = Object.getPrototypeOf(t)) {
                if (store.get(t)?.get(propertyKey)?.has(metadataKey)) {
                    return true
                }
            }
            return false
        }

        const getMetadata: typeof Reflect.getMetadata = (metadataKey, target, propertyKey) => {
            for (let t: object | null = target; t !== null; t = Object.getPrototypeOf(t)) {
                if (store.get(t)?.get(propertyKey)?.has(metadataKey)) {
                    return store.get(t)?.get(propertyKey)?.get(metadataKey)
                }
            }
        }

        const metadata: typeof Reflect.metadata = (metadataKey, metadataValue) => {
            return (target, propertyKey) => {
                defineMetadata(metadataKey, metadataValue, target, propertyKey)
            }
        }

        Object.assign(Reflect, {
            hasMetadata,
            getMetadata,
            defineMetadata,
            metadata,
        })
    }
}

export function getMetadata(proto: object, key: Key): Meta | void {
    if (typeof Reflect.getMetadata !== "function") return

    function get(metadataKey: string): unknown {
        if (Reflect.hasMetadata(metadataKey, proto, key)) {
            const data = Reflect.getMetadata(metadataKey, proto, key)
            return typeof data === "undefined" ? GObject.VoidType : data
        }
    }

    return {
        type: get("design:type") as Type | undefined,
        paramtypes: Reflect.getMetadata("design:paramtypes", proto, key) as Type[] | undefined,
        returntype: get("design:returntype") as Type | undefined,
    }
}
