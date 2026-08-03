import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

const giMock = (name: string) =>
    fileURLToPath(new URL(`./packages/gnim/lib/_tests/${name}.mock.ts`, import.meta.url))

export default defineConfig({
    test: {
        include: ["packages/gnim/lib/_tests/**/*.test.ts"],
    },
    resolve: {
        alias: [
            { find: "gi://GObject?version=2.0", replacement: giMock("GObject") },
            { find: "gi://GLib?version=2.0", replacement: giMock("GLib") },
            { find: "gi://Gio?version=2.0", replacement: giMock("Gio") },
            { find: "gettext", replacement: giMock("Gettext") },
        ],
    },
})
