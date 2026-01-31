{rustPlatform}: let
  cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
  pkg = cargoToml.package;
in
  rustPlatform.buildRustPackage {
    pname = pkg.name;
    version = pkg.version;

    # FIXME: clean paths
    src = ../..;

    cargoHash = "sha256-R1coa+Egq/dp0nHMuz/BANrBwxOjDqZNSadHHBp6DKQ=";
    cargoBuildFlags = ["--bin" pkg.name];
  }
