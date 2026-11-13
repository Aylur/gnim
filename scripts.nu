#!/usr/bin/env nu

let runtime = $env.GNOME_RUNTIME? | default "50"

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home $"org.gnome.Sdk//($runtime)" -r /usr/share/gir-1.0 ./.gnim/girs

    if (which nix | length) > 0 {
        pnpm --filter @gnim-js/gnome-shell run girs
    }

    (cargo run
        --package gnim
        --
        types
        -d $"packages/gnome-shell/gir-1.0/gnome($runtime)"
        -d .gnim/girs
        -i Gee-0.8
    )
}

def "main check" [] {
    main types
    $env.ESLINT_FLAGS = "unstable_native_nodejs_ts_config"
    pnpm run --parallel '/(typecheck|fmt|lint|test)/'
}

def main [] {
    nu $env.CURRENT_FILE --help
}
