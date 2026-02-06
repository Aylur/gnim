{rustPlatform}: let
  cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
  pkg = cargoToml.package;
in
  rustPlatform.buildRustPackage {
    pname = pkg.name;
    version = pkg.version;

    # FIXME: clean paths
    src = ../..;

    cargoHash = "";
    cargoBuildFlags = ["--bin" pkg.name];
  }
