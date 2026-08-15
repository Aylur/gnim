#!/usr/bin/env nu

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home org.gnome.Sdk -r /usr/share/gir-1.0 ./.gnim/girs
    girgen -d packages/gnome-shell/gir-1.0/gnome50 -d .gnim/girs -i Gee-0.8 gjs -o .gnim/types/gi
}

def "main ci" [] {
    mkdir .gnim/types/gi

    if (ls .gnim/types/gi | length) == 0 {
        girgen -d .gnim/girs -i Gee-0.8 gjs -o .gnim/types/gi
    }

    $env.ESLINT_FLAGS = "unstable_native_nodejs_ts_config"
    pnpm run --parallel '/(typecheck|fmt:check|lint|test)/'
}

def main [] {
    nu $env.CURRENT_FILE --help
}
