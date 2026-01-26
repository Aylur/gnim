{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    forAllSystems = nixpkgs.lib.genAttrs [
      "x86_64-linux"
      "x86_64-darwin"
      "aarch64-linux"
      "aarch64-darwin"
    ];
  in {
    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      type-dirs =
        pkgs.writers.writeNu "type-dirs"
        # nu
        ''
          $env.XDG_DATA_DIRS
          | split row ':'
          | where { $in != '/run/current-system/sw/share' }
          | each { $'($in)/gir-1.0' }
          | where { $in | path exists  }
          | str join ':'
        '';
    in {
      default = with pkgs;
        mkShell {
          packages = [
            wrapGAppsHook4
            gobject-introspection
            glib
            libadwaita
            gtk3
            gtk4
            gjs
            esbuild
            libsoup_3
            mutter
            gnome-shell
          ];
          shellHook =
            # sh
            ''
              export GNIM_TYPE_DIRS="$(${type-dirs}):${mutter}/lib/mutter-17:${gnome-shell}/lib/"
            '';
        };
    });
  };
}
