#!/usr/bin/env nu

let UUID = open metadata.json | get uuid

def "main build" [] {
    rm -rf dist

    rolldown --config rolldown.config.ts

    # rolldown does not support css
    (esbuild
        --bundle src/extension/stylesheet.css
        --outfile=dist/stylesheet.css
        --target=firefox116
    )

    gnim schemas src -o dist/schemas --compile
    cp metadata.json dist

    if ("po" | path exists) {
        cp -r po/*.po dist/po
    }

    prettier --write dist --ignore-path /dev/null
}

def "main types" [] {
    let latest_ver = open metadata.json | get shell-version | last
    let gnome_gir = $"node_modules/@gnim-js/gnome-shell/gir-1.0/gnome($latest_ver)"
    gnim types -d $gnome_gir --alias -i Gtk-3.0 -i Gdk-3.0
}

def "main install" [] {
    let path = $"($env.HOME)/.local/share/gnome-shell/extensions/($UUID)"

    rm -rf $path
    cp -r dist $path
    rm -rf dist
}

def "main dev" [] {
    main build
    main install
    dbus-run-session gnome-shell --devkit --wayland
}

def "main gettext" [] {
    mkdir po

    let files = git ls-files "*.ts" "*.tsx" | split row "\n"

    (xgettext ...$files
        --from-code=UTF-8
        --output=$"po/($UUID).pot"
        --language=JavaScript
        --keyword=p:1c,2
        --keyword=t
        --keyword=n:1,2
    )
}

def "main pack" [] {
    main build
    cd dist/
    rm schemas/gschemas.compiled
    ^zip -r $"../($UUID).shell-extension.zip" .
}

def main [] {
    nu $nu.current-exe --help
}
