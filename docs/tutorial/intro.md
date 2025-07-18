# Intro

This tutorial will walk you through creating a Gtk4 application from scratch
using Gnim. Before jumping in, you are expected to know
[TypeScript](https://learnxinyminutes.com/typescript/) or at least JavaScript.

## JavaScript Runtime

The JavaScript runtime Gnim uses is [GJS](https://gitlab.gnome.org/GNOME/gjs).
It is built on Firefox's SpiderMonkey JavaScript engine and the GNOME platform
libraries.

> [!IMPORTANT]
>
> GJS is **not** Node, **not** Deno, and **not** Bun. GJS does not implement
> some common Web APIs you might be used to from these other runtimes such as
> `fetch`. The standard library of GJS comes from
> [`GLib`](https://docs.gtk.org/glib/), [`Gio`](https://docs.gtk.org/gio//) and
> [`GObject`](https://docs.gtk.org/gobject/) which are libraries written in C
> and exposed to GJS through
> [FFI](https://en.wikipedia.org/wiki/Foreign_function_interface) using
> [GObject Introspection](https://gi.readthedocs.io/en/latest/)

## Development Environment

For setting up a development environment you will need the following
dependencies installed:

- gjs
- gtk4
- JavaScript package manager of your choice

::: code-group

```sh [Arch]
sudo pacman -Syu gjs gtk4 npm
```

```sh [Fedora]
sudo dnf install gjs-devel gtk4-devel npm
```

```sh [Ubuntu]
sudo apt install libgjs-dev libgtk-3-dev npm
```

```nix [Nix]
# flake.nix
{
  inputs.nixpkgs.url = "github:nixos/nixpkgs?ref=nixos-unstable";

  outputs = {
    self,
    nixpkgs,
  }: let
    forAllSystems = nixpkgs.lib.genAttrs ["x86_64-linux" "aarch64-linux"];
  in {
    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      # enter this shell using `nix develop`
      default = pkgs.mkShell {
        packages = with pkgs; [
          gobject-introspection
          glib
          nodePackages.npm
          gtk4
          gjs
        ];
      };
    });
  };
}
```

:::

Since GJS does not support `node_modules` we have to use a bundler. For this
tutorial we will use `esbuild` which you can either install using your system
package manager or `npm`. You also have to configure `tsconfig.json` which will
tell the bundler about the environment and JSX runtime.

1. init a directory

   ```sh
   mkdir gnim-app
   cd gnim-app
   npm install gnim
   npm install typescript esbuild @girs/gtk-4.0 @girs/gjs -D
   ```

2. configure `tsconfig.json`

   ```json
   {
     "compilerOptions": {
       "target": "ES2020",
       "module": "ES2022",
       "lib": ["ES2024"],
       "outDir": "dist",
       "strict": true,
       "moduleResolution": "Bundler",
       "skipLibCheck": true,
       "jsx": "react-jsx",
       "jsxImportSource": "gnim/gtk4"
     }
   }
   ```

3. by convention, source files go in the `src` directory

   ```sh
   mkdir src
   ```

4. create an `env.d.ts` file

   ```ts
   import "@girs/gtk-4.0"
   import "@girs/gjs"
   import "@girs/gjs/dom"
   ```

5. create the entry point

   ```ts
   console.log("hello world")
   ```

6. write a build script

   ```sh
   # scripts/build.sh
   esbuild --bundle src/main.ts \
     --outdir=dist \
     --external:gi://* \
     --external:resource://* \
     --external:system \
     --external:gettext \
     --format=esm \
     --sourcemap=inline
   ```

Finally, your project structure should like like this:

```txt
.
├── node_modules
├── package-lock.json
├── package.json
├── scripts
│   └── build.sh
├── src
│   ├── env.d.ts
│   └── main.ts
└── tsconfig.json
```

To make running the project easier you can add a `dev` script in `package.json`.

```json
{
  "scripts": {
    "dev": "bash scripts/build.sh ; gjs -m dist/main.js"
  },
  "dependencies": {},
  "devDependencies": {}
}
```

Running the project then will consist of this short command:

```sh
npm run dev
```
