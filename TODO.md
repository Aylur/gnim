Blockers (release setup and docs)

1. CI: publish, testing
2. by package package.json meta, and README.md
3. prepublish rebuild hooks

Gtk4

- Object-valued properties given as children
  - document Portal+ref+onMount
  - slot="property" `parent[slot] = object`

- missing `removeChild` impls

CLI and create-gnim

- Panics on bad paths: exe and schemas panic on a bad -o path and leave
  $XDG*RUNTIME_DIR/gnim*<pid> behind.
- bin/gnim.ts wrapper: it exits 0 when spawning fails, and install paths
  containing spaces break it.
- create-gnim:
  - main() isn't awaited, so errors become unhandled rejections and the spinner
    keeps running (create/bin/index.ts:532).
  - An existing non-empty directory is silently overwritten.
  - Names containing spaces or quotes aren't validated and break the generated
    files.
- gnome-shell template translations: they never work. It copies raw .po files
  into a folder that doesn't exist, instead of compiled .mo files in locale/.
- Unpublished template change: create-gnim needs a version bump; commit e1af4ad
  changed templates after beta.25 was published.
