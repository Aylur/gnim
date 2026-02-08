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
    in {
      default = with pkgs;
        mkShell {
          packages = [
            cargo
            rustup
            gcc

            typescript
            nodejs
            wrapGAppsHook4
            gobject-introspection
            glib
            libadwaita
            gtk3
            gtk4
            gjs
            libsoup_3
          ];
        };
    });

    packages = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      gnim = pkgs.callPackage ./packages/cli {};
      gnim-types = pkgs.callPackage ./packages/types {};
    });
  };
}
