import type GObject from "gi://GObject"

type Type = { new (...args: any[]): GObject.Object }

// @ts-expect-error missing types
const mod = import("resource:///org/gnome/shell/misc/signalTracker.js")

export const registerDestroyableType: (type: Type) => void = await mod
    .then((mod) => mod.registerDestroyableType)
    .catch(() => () => void 0)
