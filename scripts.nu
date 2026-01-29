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

def "main build:types" [] {
    let os = "console.log(process.platform)" | node
    let cpu = "console.log(process.arch)" | node

    cargo build --bin gnim-types --release

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
    mv target/release/gnim-types $dist
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

def "main build" [] {
    main build:types
    main build:gnim
}

def "main setup" [] {
    pnpm -r install
    main types
}

def main [] {
    nu $env.CURRENT_FILE --help
}
