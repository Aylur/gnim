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
    cargo build --bin gnim-types --target x86_64-unknown-linux-musl
    ./target/x86_64-unknown-linux-musl/debug/gnim-types --verbose --outdir packages/gnim/.types/gi
}

def "main build:types-linux-64" [] {
    let os = "linux"
    let cpu = "x64"

    cargo build --release --target x86_64-unknown-linux-musl

    let target = $"types-($os)-($cpu)"
    let version = open packages/types/Cargo.toml | get package | get version

    let package = {
        name: $"@gnim-js/($target)",
        version: $version,
        os: [$os]
        cpu: [$cpu]
        exports: "./gnim-types"
    }

    let dist = $"dist/($target)"
    mkdir $dist
    mv target/x86_64-unknown-linux-musl/release/gnim-types $dist
    $package | save -f $"($dist)/package.json"
}

def "main build:gnim" [] {
    let target = $"(pwd)/dist/gnim"
    cd packages/gnim

    tsc -b tsconfig.src.json
    rm build/src/tsconfig.src.tsbuildinfo

    mkdir $target
    glib-compile-resources src/resource.xml --sourcedir=build/src --target=$"($target)/gnim.gresource"
    cp -r src $target
    cp package.json $target

    tsc -b tsconfig.bin.json
    rm build/bin/tsconfig.bin.tsbuildinfo
    cp -r build/bin $target

    cp ../../README.md $target
    cp ../../LICENSE $target
    rm -r build
}

def "main setup" [] {
    pnpm -r install
    main types
}

def main [] {
    nu $env.CURRENT_FILE --help
}
