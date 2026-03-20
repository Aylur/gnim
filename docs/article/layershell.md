# Gtk Layer Shell

If you wish to use gtk4-layer-shell in GJS you need to preload it using the
`LD_PRELOAD` environment variable. Gnim's `dev` and `run` command has a flag to
do this for you.

```sh
gnim run --gtk4-layer-shell script.ts
gnim dev --gtk4-layer-shell script.ts
```

It will look up the location of `libgtk4-layer-shell.so` using `pkg-config`.

::: code-group

```sh [Arch]
sudo pacman -Syu pkgconf gtk4-layer-shell
```

```sh [Fedora]
sudo dnf install pkgconf-pkg-config gtk4-layer-shell
```

```sh [Ubuntu]
sudo apt install pkg-config libgtk4-layer-shell-dev
```

```nix [Nix]
{
  outputs = { self, nixpkgs, }: let
    forAllSystems = nixpkgs.lib.genAttrs ["x86_64-linux" "aarch64-linux"];
  in {
    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.mkShell {
        packages = with pkgs; [
          pkg-config
          gtk4-layer-shell
        ];
      };
    });
  };
}
```

:::

> [!TIP]
>
> You might want to unset `LD_PRELOAD` in your application so that it does not
> leak into subprocesses.
>
> ```js
> GLib.setenv("LD_PRELOAD", "", true)
> app.runAsync([])
> ```
