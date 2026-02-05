#!/usr/bin/env nu

def "main clean" [] {
    rm -rf dist/
    rm -rf target/
    rm -rf node_modules/
    rm -rf packages/docs/node_modules/
    rm -rf packages/gnim/node_modules/
    rm -rf packages/gnim/.types/
}

def "main types" [] {
    cargo build --bin gnim-types
    ./target/debug/gnim-types --verbose --outdir packages/gnim/.types/gi
}

def build_types [--os: string, --cpu: string, --target: string] {
    cargo build --release --target $target

    let name = $"types-($os)-($cpu)"
    let version = open packages/types/Cargo.toml | get package | get version

    let package = {
        name: $"@gnim-js/($name)",
        version: $version,
        os: [$os]
        cpu: [$cpu]
        exports: "./gnim-types"
    }

    let dist = $"dist/($name)"
    mkdir $dist
    mv $"target/($target)/release/gnim-types" $dist
    $package | save -f $"($dist)/package.json"
}

def "main build:gnim" [] {
    let target = $"(pwd)/dist/gnim"
    cd packages/gnim

    tsc -b tsconfig.src.json
    tsc -b tsconfig.bin.json

    rm build/src/tsconfig.src.tsbuildinfo
    rm build/bin/tsconfig.bin.tsbuildinfo

    mkdir $target
    mv build/* $target
    cp package.json $target
    cp ../../README.md $target
    cp ../../LICENSE $target
    rm -r build
}

def "main build" [] {
    rm -rf dist

    do {
        main types
        main build:gnim
    }

    do {
        build_types --cpu x64 --os linux --target x86_64-unknown-linux-musl
    }
}

def main [] {
    nu $env.CURRENT_FILE --help
}
