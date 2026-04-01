# Intro

This tutorial will walk you through creating a Gtk4 application from scratch
using Gnim. Before jumping in, you are expected to know
[TypeScript](https://learnxinyminutes.com/typescript/) or at least
[JavaScript](https://learnxinyminutes.com/javascript/).

## JavaScript Runtime

The JavaScript runtime Gnim uses is [GJS](https://gitlab.gnome.org/GNOME/gjs).
It is built on Firefox's SpiderMonkey JavaScript engine and the GNOME platform
libraries.

> [!IMPORTANT]
>
> GJS is **not** Node, **not** Deno, and **not** Bun. GJS does not implement
> some common Web APIs you might be used to from these other runtimes such as
> `fetch`. The standard library of GJS comes from
> [`GLib`](https://docs.gtk.org/glib/), [`Gio`](https://docs.gtk.org/gio/) and
> [`GObject`](https://docs.gtk.org/gobject/) which are libraries written in C
> and exposed to GJS through
> [FFI](https://en.wikipedia.org/wiki/Foreign_function_interface) using
> [GObject Introspection](https://gi.readthedocs.io/en/latest/)

## Creating a new project

You will need the following dependencies installed:

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
sudo apt install libgjs-dev libgtk-4-dev npm
```

```nix [Nix]
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
      # [!code focus:10]
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

1. Create a project directory and install gnim

   ```sh
   mkdir gnim-app
   cd gnim-app
   npm install gnim
   ```

2. Configure `tsconfig.json`

   ```json
   {
     "compilerOptions": {
       "experimentalDecorators": true,
       "target": "ES2022",
       "module": "ES2022",
       "lib": ["ES2024"],
       "outDir": "dist",
       "strict": true,
       "moduleResolution": "Bundler",
       "skipLibCheck": true,
       "jsx": "react-jsx",
       "jsxImportSource": "gnim",
       "typeRoots": ["./.gnim/types"]
     },
     "include": ["./src/**/*"]
   }
   ```

3. Add scripts to `package.json`

```json
{
  "scripts": {
    "types": "gnim types",
    "dev": "gnim dev src/main.tsx"
  }
}
```

4. Generate types

   ```sh
   npm run types
   ```

   > [!TIP]
   >
   > Make sure to ignore generated files
   >
   > ```sh
   > echo ".gnim/" > .gitignore
   > ```

5. Create the entry point

   ```tsx
   // src/main.tsx
   import Gtk from "gi://Gtk?version=4.0"
   import { render } from "gnim/gtk4"

   function App() {
     return <Gtk.Window visible>hello</Gtk.Window>
   }

   const app = new Gtk.Application()
   app.connect("activate", () => {
     const dispose = render(App, app)
     app.connect("shutdown", dispose)
   })
   app.runAsync(null)
   ```

6. Start the dev server

   ```sh
   npm run dev
   ```
