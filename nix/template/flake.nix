{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = {
    self,
    nixpkgs,
  }: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = nixpkgs.lib.genAttrs systems;

    dependencies = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
    in {
      # run-time dependencies
      buildInputs = [
        pkgs.glib
        pkgs.gjs
        pkgs.gtk4
        pkgs.libadwaita
        pkgs.libadwaita
        pkgs.gtk4-layer-shell # only used by the layer-shell template
      ];
      # build-time dependencies
      nativeBuildInputs = [
        pkgs.pnpm # JavaScript package manager
        pkgs.meson # build tool, frontend for ninja
        pkgs.ninja # build tool, backend used by meson
        pkgs.pkg-config # tool to find dependencies and system files during build steps
        pkgs.wrapGAppsHook4 # tool required to run gtk programs built by nix
        pkgs.glib # required by gnim to build schemas
        pkgs.gobject-introspection # used to run scripts
        pkgs.nodejs # used to run scripts
        pkgs.gettext # used to scan source code and generate translation files
        pkgs.desktop-file-utils # used to install .desktop files
        pkgs.zip # used by the gnome-shell template's pack command
        pkgs.dbus # used by the gnome-shell template's dev command
      ];
    });
  in {
    devShells = forAllSystems (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      deps = dependencies.${system};
    in {
      default = pkgs.mkShell {
        packages = deps.nativeBuildInputs ++ deps.buildInputs;
      };
    });

    # derivation to build the main program in the adwaita and layer-shell templates
    packages = forAllSystems (system: let
      package = builtins.fromJSON (builtins.readFile ./package.json);
      pkgs = nixpkgs.legacyPackages.${system};
      deps = dependencies.${system};
    in {
      default = pkgs.stdenv.mkDerivation {
        inherit (package) name version;
        inherit (deps) buildInputs nativeBuildInputs;

        src = pkgs.stdenv.mkDerivation {
          name = "${package.name}-src-with-deps";
          src = ./.;

          pnpmDeps = pkgs.fetchPnpmDeps {
            pname = "${package.name}-pnpm-deps";
            src = ./.;
            fetcherVersion = 4;
            hash = pkgs.lib.fakeHash;
          };

          nativeBuildInputs = [
            pkgs.nodejs
            pkgs.pnpm
            pkgs.pnpmConfigHook
          ];

          installPhase = ''
            mkdir $out
            cp -r * $out
          '';
        };
      };
    });
  };
}
