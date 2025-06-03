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
      default = pkgs.mkShell {
        packages = with pkgs; [
          glib
          nodejs
          nodePackages.npm
          vscode-langservers-extracted
          vtsls
          markdownlint-cli2
          blueprint-compiler
          libadwaita
          gtk3
          gtk4
          gjs
          typescript
          esbuild
          libsoup_3
        ];
      };
    });
  };
}
