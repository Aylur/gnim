#!/usr/bin/env nu

def "main types" [] {
    let flags = [
        "--verbose"
        "--outdir" "gnim/.types/gi"
        ...(if "GNIM_TYPE_DIRS" in $env {
            ["--dirs" $env.GNIM_TYPE_DIRS]
        })
    ]
    cargo build
    ./target/debug/gnim-types ...$flags
}

def "main build" [] {
    # TODO: cargo build for each arch and distribute the cli
    pnpm -F gnim run build
}

def "main gnim:build" [] {
    rm -rf dist
    rm -rf build
    tsc
    mkdir dist
    glib-compile-resources src/resource.xml --sourcedir=build --target=dist/gnim.gresource
    cp -r src/* dist/
}

def main [] {
    nu $env.CURRENT_FILE --help
}
