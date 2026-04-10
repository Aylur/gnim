#!/usr/bin/env nu

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home org.gnome.Sdk -r /usr/share/gir-1.0 ./.gnim
    cargo run --bin gnim -- types --verbose -d .gnim/gir-1.0
}

def build_cli [--os: string, --cpu: string, --target: string] {
    cargo build --release --target $target

    let name = $"($os)-($cpu)"
    let version = open packages/cli/Cargo.toml | get package | get version

    let package = {
        name: $"@gnim-js/($name)",
        version: $version,
        os: [$os]
        cpu: [$cpu]
        exports: "./gnim"
    }

    let dist = $"dist/($name)"
    mkdir $dist
    mv $"target/($target)/release/gnim" $dist
    $package | save -f $"($dist)/package.json"
}

def "main build:cli" [] {
    rm -rf dist
    build_cli --os linux --cpu x64 --target x86_64-unknown-linux-musl
    # build_gnim --os linux --cpu arm64 --target aarch64-unknown-linux-musl
}

def main [] {
    nu $env.CURRENT_FILE --help
}
