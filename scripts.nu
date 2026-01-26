#!/usr/bin/env nu

def "main clean" [] {
    rm -rf dist/
    rm -rf target/
    rm -rf gnim/node_modules
    rm -rf gnim/.types
    rm -rf node_modules
}

def "main setup" [] {
    main types
    pnpm install
}

def "main types" [] {
    cargo build
    ./target/debug/gnim types --verbose --outdir gnim/.types/gi
}

def "main build:cli" [] {
    let os = "console.log(process.platform)" | node
    let cpu = "console.log(process.arch)" | node

    cargo build --release
    let target = $"cli-($os)-($cpu)"

    let package = {
        name: $"@gnim-js/($target)",
        version: 0.1.0,
        os: [$os]
        cpu: [$cpu]
    }

    let dist = $"dist/($target)"
    mkdir $dist
    mv target/release/gnim $dist
    $package | save -f $"($dist)/package.json"
}

def "main build:gnim" [] {
    cd gnim
    tsc --outDir build
    mkdir ../dist/gnim
    glib-compile-resources src/resource.xml --sourcedir=build --target=../dist/gnim/gnim.gresource
    cp -r src/* ../dist/gnim
    cp package.json ../dist/gnim
    rm -r build
}

def "main build" [] {
    main build:cli
    main build:gnim
}

def main [] {
    nu $env.CURRENT_FILE --help
}
