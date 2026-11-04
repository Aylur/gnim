{
  inputs = {
    nixpkgs2511.url = "github:nixos/nixpkgs/nixos-25.11";
    nixpkgs2605.url = "github:nixos/nixpkgs/nixos-26.05";
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs = inputs: let
    systems = ["x86_64-linux" "aarch64-linux"];
    forAllSystems = inputs.nixpkgs.lib.genAttrs systems;

    bundle = nixpkgs: system: version: let
      pkgs = nixpkgs.legacyPackages.${system};
      mutter = pkgs.mutter;
      gnome-shell = pkgs.gnome-shell.overrideAttrs (old: {
        patches = (old.patches or []) ++ [./install_gir.patch];
      });
    in
      pkgs.linkFarm "gnome-shell-girs" {
        "Clutter-${version}.gir" = "${mutter}/lib/mutter-${version}/Clutter-${version}.gir";
        "Cogl-${version}.gir" = "${mutter}/lib/mutter-${version}/Cogl-${version}.gir";
        "Mtk-${version}.gir" = "${mutter}/lib/mutter-${version}/Mtk-${version}.gir";
        "Meta-${version}.gir" = "${mutter}/lib/mutter-${version}/Meta-${version}.gir";
        "St-${version}.gir" = "${gnome-shell}/share/gnome-shell/St-${version}.gir";
        "Shell-${version}.gir" = "${gnome-shell}/share/gnome-shell/Shell-${version}.gir";
        "Gvc-1.0.gir" = "${gnome-shell}/share/gnome-shell/Gvc-1.0.gir";
      };
  in {
    packages = forAllSystems (system: {
      gnome49 = bundle inputs.nixpkgs2511 system "17";
      gnome50 = bundle inputs.nixpkgs2605 system "18";
    });
  };
}
