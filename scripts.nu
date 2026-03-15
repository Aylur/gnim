#!/usr/bin/env nu

def "main clean" [] {
    for dir in (open .gitignore | split row "\n") {
        rm -rf $dir
    }
}

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home org.gnome.Sdk -r /usr/share/gir-1.0 ./.gnim/girs
    cargo run --bin gnim -- types --verbose -d .gnim/girs
}

def build_types [--os: string, --cpu: string, --target: string] {
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

def "main build:gnim" [] {
    let target = "./dist/gnim" | path expand
    mkdir ($target | path dirname)

    cd packages/gnim
    tsc
    cp package.json build
    mv build $target
    cd ../..
    cp README.md $target
    cp LICENSE $target
}

def "main build" [] {
    rm -rf dist

    main build:gnim
    build_types --os linux --cpu x64 --target x86_64-unknown-linux-musl
    # build_types --os linux --cpu arm64 --target aarch64-unknown-linux-musl
}

def main [] {
    nu $env.CURRENT_FILE --help
}
