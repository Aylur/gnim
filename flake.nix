{
  description = "Gnim";

  inputs.nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";

  outputs = inputs: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = inputs.nixpkgs.lib.genAttrs systems;
  in {
    templates = {
      default = {
        path = ./nix/template;
        description = "Gnim Application";
        welcomeText = ''
          # Getting Started

          - `nix develop` to enter the development environment
          - `pnpm create gnim@beta` to set up the initial project
          - `pnpm dev` to start the development process
        '';
      };
    };

    devShells = forAllSystems (system: let
      pkgs = inputs.nixpkgs.legacyPackages.${system};
    in {
      default = pkgs.mkShell {
        GIO_EXTRA_MODULES = "${pkgs.glib-networking}/lib/gio/modules";

        packages = [
          pkgs.nodejs
          pkgs.pnpm_12
          pkgs.gjs
          pkgs.glib
          pkgs.gobject-introspection
          pkgs.libsoup_3
          pkgs.gettext
          pkgs.dbus
          pkgs.shared-mime-info
          pkgs.openssl
          pkgs.meson
          pkgs.ninja
          pkgs.pkg-config
          pkgs.desktop-file-utils
          pkgs.gtk3
          pkgs.gtk4
          pkgs.libadwaita
          pkgs.gtk4-layer-shell
        ];
      };
    });
  };
}
