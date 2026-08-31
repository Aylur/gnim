import GLib from "gi://GLib?version=2.0"
import GObject from "gi://GObject?version=2.0"
import type { KebabCase } from "../util"
// @ts-expect-error missing union type
import GIRepository from "gi://GIRepository"

function getEnumDefaultValue(gtype: GObject.GType) {
    const Repo = GIRepository as
        | typeof import("gi://GIRepository?version=3.0").default
        | typeof import("gi://GIRepository?version=2.0").default

    if (Repo.__version__ === "3.0") {
        const info = Repo.Repository.dup_default().find_by_gtype(gtype)
        if (info instanceof Repo.EnumInfo || info instanceof Repo.FlagsInfo) {
            return info.get_value(0).get_value()
        }
    } else {
        const info = Repo.Repository.get_default().find_by_gtype(gtype)
        return Repo.value_info_get_value(Repo.enum_info_get_value(info, 0))
    }
    throw Error(`failed to find default value for ${gtype.name}`)
}

const MININT8 = GLib.MININT8
const MAXINT8 = GLib.MAXINT8
const MAXUINT8 = GLib.MAXUINT8

const MAXINT32 = GLib.MAXINT32
const MININT32 = GLib.MININT32
const MAXUINT32 = GLib.MAXUINT32

const MININT64 = GLib.MININT64_BIGINT as unknown as number
const MAXINT64 = GLib.MAXINT64_BIGINT as unknown as number
const MAXUINT64 = GLib.MAXUINT64_BIGINT as unknown as number

const MINLONG = Number.MIN_SAFE_INTEGER
const MAXLONG = Number.MAX_SAFE_INTEGER
const MAXULONG = Number.MAX_SAFE_INTEGER

const MAXFLOAT = 3.4028234663852886e38
const MAXDOUBLE = Number.MAX_VALUE

export function pspecFromGType(
    type: GObject.GType<unknown>,
    name: string,
    flags: GObject.ParamFlags,
) {
    switch (type) {
        case GObject.TYPE_CHAR:
            return GObject.param_spec_char(name, null, null, MININT8, MAXINT8, 0, flags)
        case GObject.TYPE_UCHAR:
            return GObject.param_spec_uchar(name, null, null, 0, MAXUINT8, 0, flags)
        case GObject.TYPE_INT:
            return GObject.param_spec_int(name, null, null, MININT32, MAXINT32, 0, flags)
        case GObject.TYPE_UINT:
            return GObject.param_spec_uint(name, null, null, 0, MAXUINT32, 0, flags)
        case GObject.TYPE_LONG:
            return GObject.param_spec_long(name, null, null, MINLONG, MAXLONG, 0, flags)
        case GObject.TYPE_ULONG:
            return GObject.param_spec_ulong(name, null, null, 0, MAXULONG, 0, flags)
        case GObject.TYPE_INT64:
            return GObject.param_spec_int64(name, null, null, MININT64, MAXINT64, 0, flags)
        case GObject.TYPE_UINT64:
            return GObject.param_spec_uint64(name, null, null, 0, MAXUINT64, 0, flags)
        case GObject.TYPE_FLOAT:
            return GObject.param_spec_float(name, null, null, -MAXFLOAT, MAXFLOAT, 0, flags)
        case GObject.TYPE_DOUBLE:
            return GObject.param_spec_double(name, null, null, -MAXDOUBLE, MAXDOUBLE, 0, flags)
        case GObject.TYPE_BOOLEAN:
            return GObject.param_spec_boolean(name, null, null, false, flags)
        case GObject.TYPE_STRING:
            return GObject.param_spec_string(name, null, null, "", flags)
        case GObject.TYPE_JSOBJECT:
            return GObject.param_spec_boxed(name, null, null, GObject.TYPE_JSOBJECT, flags)
        case GObject.TYPE_VARIANT:
            return GObject.param_spec_variant(
                name,
                null,
                null,
                new GLib.VariantType("*"),
                null,
                flags,
            )
        default:
            if (GObject.type_is_a(type, GObject.TYPE_OBJECT)) {
                return GObject.param_spec_object(name, null, null, type, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_GTYPE)) {
                return GObject.param_spec_gtype(name, null, null, type, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_BOXED)) {
                return GObject.param_spec_boxed(name, null, null, type, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_ENUM)) {
                const defaultValue = getEnumDefaultValue(type)
                return GObject.param_spec_enum(name, null, null, type, defaultValue, flags)
            }
            if (GObject.type_is_a(type, GObject.TYPE_FLAGS)) {
                const defaultValue = getEnumDefaultValue(type)
                return GObject.param_spec_flags(name, null, null, type, defaultValue, flags)
            }
            throw Error(`cannot guess ParamSpec from GObject.GType "${type}"`)
    }
}

/**
 * @experimental
 * Asserts a gtype in cases where the type is too loose/strict.
 *
 * @example
 * ```ts
 * type Tuple = [number, number]
 * const Tuple = gtype<Tuple>(Array)
 *
 * class {
 *   \@property(Tuple) value: Tuple = [1, 2]
 * }
 * ```
 */
export function gtype<Assert>(type: GObject.GType<any> | { $gtype: GObject.GType<any> }): {
    $gtype: GObject.GType<Assert>
} {
    return "$gtype" in type ? type : { $gtype: type }
}

declare global {
    interface FunctionConstructor {
        $gtype: GObject.GType<(...args: any[]) => any>
    }

    interface ArrayConstructor {
        $gtype: GObject.GType<any[]>
    }

    interface DateConstructor {
        $gtype: GObject.GType<Date>
    }

    interface MapConstructor {
        $gtype: GObject.GType<Map<any, any>>
    }

    interface SetConstructor {
        $gtype: GObject.GType<Set<any>>
    }
}

// @ts-expect-error let gnome-shell extensions disable it
if (!import.meta.GNIM_DISABLE_GLOBAL_OVERRIDES) {
    Function.$gtype = GObject.TYPE_JSOBJECT as FunctionConstructor["$gtype"]
    Array.$gtype = GObject.TYPE_JSOBJECT as ArrayConstructor["$gtype"]
    Date.$gtype = GObject.TYPE_JSOBJECT as DateConstructor["$gtype"]
    Map.$gtype = GObject.TYPE_JSOBJECT as MapConstructor["$gtype"]
    Set.$gtype = GObject.TYPE_JSOBJECT as SetConstructor["$gtype"]
}

export type Annotations<O extends GObject.Object, S extends keyof O> = {
    [K in S as K extends string ? KebabCase<K> : never]: O[K]
}
