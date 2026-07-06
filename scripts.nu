#!/usr/bin/env nu

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home org.gnome.Sdk -r /usr/share/gir-1.0 ./.gnim/girs
    cargo run --bin gnim -- types --verbose -d .gnim/girs -i Gee-0.8
}

def main [] {
    nu $env.CURRENT_FILE --help
}
