#!/usr/bin/env nu

let runtime = $env.GNOME_RUNTIME? | default "50"
let ci = $env.CI? == "true"

def "main types" [] {
    let shell_girs = $"packages/gnome-shell/gir-1.0/gnome($runtime)"

    mkdir .gnim

    if not $ci {
        flatpak run --command=cp --filesystem=home $"org.gnome.Sdk//($runtime)" -r /usr/share/gir-1.0 ./.gnim/girs
    }

    if (which nix | length) > 0 {
        pnpm --filter @gnim-js/gnome-shell run girs
    }

    (cargo run
        --package gnim
        --
        types
        -d $shell_girs
        -d .gnim/girs
        -i Gee-0.8
    )
}

def "main check" [] {
    main types
    $env.ESLINT_FLAGS = "unstable_native_nodejs_ts_config"
    pnpm run --parallel '/(typecheck|fmt|lint|test)/'
}


def "main pack-test" [] {
    let tmp = mktemp --directory --tmpdir gnim-pack-test.XXXXXX
    let packs = $"($tmp)/packs"

    mkdir $packs

    pnpm run build
    pnpm -r pack --pack-destination $packs

    let tarballs = glob $"($packs)/*.tgz"
    | each {|tgz| {(tar -xOzf $tgz package/package.json | from json | get name): $"file:($tgz)"} }
    | reduce {|it, acc| $acc | merge $it }

    let templates = [
        { template: "empty", id: "com.example.Empty" }
        { template: "adwaita", id: "com.example.Adwaita" }
        { template: "layer-shell", id: "com.example.LayerShell" }
        { template: "gnome-shell", id: "pack-test@example" }
    ]

    let pnpm_workspace = { overrides: $tarballs, allowBuilds: { esbuild: false } } | to yaml

    for t in $templates {
        let dir = $"($tmp)/($t.template)"

        (pnpm --package ($tarballs | get create-gnim) dlx create-gnim $dir
            --template $t.template
            --id $t.id
            --name $"pack-test-($t.template)"
            --description "pack-test"
            --no-vala
            --no-git
            --no-agents
            --no-install
        )

        cd $dir
        $pnpm_workspace | save pnpm-workspace.yaml

        pnpm install --no-frozen-lockfile
        pnpm run types
        pnpm --package typescript@7 dlx tsc --noEmit
        pnpm run build
    }

    cd ($tmp | path dirname)
    rm -rf $tmp
}

def main [] {
    nu $env.CURRENT_FILE --help
}
