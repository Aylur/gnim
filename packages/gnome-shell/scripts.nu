#!/usr/bin/env nu

def "main girs" [] {
    for target in ["gnome49" "gnome50"] {
        let out = (nix build $"./gir-1.0#($target)" --print-out-paths --no-link | str trim)
        rm -rf $"gir-1.0/($target)"
        ^cp -rL --no-preserve=mode $out $"gir-1.0/($target)"
    }
}

def main [] {
    nu $env.CURRENT_FILE --help
}
