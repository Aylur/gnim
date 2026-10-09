#!/usr/bin/env nu

let runtime = $env.GNOME_RUNTIME? | default "50"

def "main types" [] {
    mkdir .gnim
    flatpak run --command=cp --filesystem=home $"org.gnome.Sdk//($runtime)" -r /usr/share/gir-1.0 ./.gnim/girs

    if (which nix | length) > 0 {
        do {
            cd packages/gnome-shell/gir-1.0/
            nix build $".#gnome($runtime)"
        }
    }

    girgen -d $"packages/gnome-shell/gir-1.0/gnome($runtime)" -d .gnim/girs -i Gee-0.8 gjs -o .gnim/types/gi
}

def "main check" [] {
    mkdir .gnim/types/gi

    if (ls .gnim/types/gi | length) == 0 {
        girgen -d $"packages/gnome-shell/gir-1.0/gnome($runtime)" -d .gnim/girs -i Gee-0.8 gjs -o .gnim/types/gi
    }

    $env.ESLINT_FLAGS = "unstable_native_nodejs_ts_config"
    pnpm run --parallel '/(typecheck|fmt|lint|test)/'
}

def main [] {
    nu $env.CURRENT_FILE --help
}
