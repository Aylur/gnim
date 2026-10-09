import { defineConfig, type RolldownOptions } from "rolldown"

// move vendored npm packages to a vendor directory
// so that they are easier to review
function entryFileNames(chunk: {
  name: string
  facadeModuleId?: string
}): string {
  const id = chunk.facadeModuleId ?? ""
  const i = id.lastIndexOf("/node_modules/")
  if (i === -1) {
    // bundler runtime helpers, e.g. "\0@oxc-project+runtime@0.147.0/helpers/esm/decorate.js"
    const helper = id.match(
      /@oxc-project[+/]runtime@[^/]+\/helpers\/esm\/(.+?)(\.[cm]?js)?$/,
    )
    return helper ? `vendor/helpers/${helper[1]}.js` : "[name].js"
  }

  // "<pkg>/dist/lib/x.ts" or "@scope/<pkg>/dist/x.ts"
  const rest = id.slice(i + "/node_modules/".length)
  const parts = rest.split("/")
  const pkg = parts[0].startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
  const inner = parts
    .slice(pkg.startsWith("@") ? 2 : 1)
    .join("/")
    .replace(/^dist\/(lib\/)?/, "")
    .replace(/\.(ts|tsx|mjs|cjs|js)$/, "")

  return `vendor/${pkg}/${inner}.js`
}

export default defineConfig({
  tsconfig: "tsconfig.json",
  external: /^(gi|resource):|^(gi|gettext|system|console|cairo)$/,
  input: ["extension.ts", "prefs.ts"],
  output: {
    dir: "dist",
    format: "esm",
    preserveModules: true,
    entryFileNames,
    comments: true,
  },
  treeshake: {
    // remove unused gi imports such as `import "gi://GLib"`
    moduleSideEffects: false,
  },
  transform: {
    jsx: {
      runtime: "automatic",
      importSource: "gnim",
      pure: false,
    },
    decorator: {
      // we are not allowed to mutate globals, such as `Reflect`, so this has no use
      emitDecoratorMetadata: false,
      legacy: true,
    },
    define: {
      // disable global overrides such as the `Reflect` polyfill and `Array.$gtype`
      "import.meta.GNIM_DISABLE_GLOBAL_OVERRIDES": JSON.stringify(true),
    },
  },
})
