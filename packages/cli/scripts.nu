#!/usr/bin/env nu

def build_cli [--os: string, --cpu: string, --target: string] {
    cargo build --release --target $target
    cp $"($env.INIT_CWD)/target/($target)/release/gnim" $"npm/($os)-($cpu)/gnim"
}

def "main build" [] {
    build_cli --os linux --cpu x64 --target x86_64-unknown-linux-musl
    # build_cli --os linux --cpu arm64 --target aarch64-unknown-linux-musl
}

def main [] {
    nu $env.CURRENT_FILE --help
}
