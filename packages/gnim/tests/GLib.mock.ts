export class Variant {}

export function getenv(name: string): string | null {
    return process.env[name] ?? null
}

const GLib = { Variant, getenv }

export default GLib
