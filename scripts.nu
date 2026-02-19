#!/usr/bin/env nu

def "main clean" [] {
    for dir in (open .gitignore | split row "\n") {
        rm -rf $dir
    }
}

def "main types" [] {
    cargo build --bin gnim
    ./target/debug/gnim types --verbose
}

def build_types [--os: string, --cpu: string, --target: string] {
    cargo build --release --target $target

    let name = $"($os)-($cpu)"
    let version = open Cargo.toml | get package | get version

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
    let target = $"(pwd)/dist/gnim"

    tsc -b tsconfig.bin.json
    tsc -b tsconfig.lib.json

    rm build/lib/tsconfig.lib.tsbuildinfo
    rm build/bin/tsconfig.bin.tsbuildinfo

    mkdir $target
    mv build/* $target
    cp package.json $target
    cp README.md $target
    cp LICENSE $target
    rm -r build
}

def "main build" [] {
    rm -rf dist

    do {
        main types
        main build:gnim
    }

    do {
        build_types --os linux --cpu x64 --target x86_64-unknown-linux-musl
        # build_types --os linux --cpu arm64 --target aarch64-unknown-linux-musl
    }
}

def main [] {
    nu $env.CURRENT_FILE --help
}
