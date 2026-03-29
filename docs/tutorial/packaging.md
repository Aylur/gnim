# Packaging

This page covers how to package your Gnim application for distribution. It
explains how to use Meson as a build system and how to create Flatpak packages.

## Meson

[Meson](https://mesonbuild.com/) is a build system commonly used for GNOME
projects. It handles compilation, bundling, and installation of your
application. The following example shows how to configure Meson to bundle your
Gnim applications.

::: code-group

```meson [meson.build]
# project name should be the name of the executable
project('example-myapp', version: '0.0.0')

root = meson.project_source_root()
name = meson.project_name()

prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')

gnim = find_program('gnim', 'node_modules/.bin/gnim')

app_prefix = '/com/exmaple/myapp/'
gresource = name + '.gresource'

# bundle into .gresource
custom_target(
  command: [
    gnim, 'bundle',
    root / 'src' / 'main.tsx',
    gresource,
    '--prefix', app_prefix,
  ],
  output: gresource,
  install: true,
  install_dir: prefix / datadir / name,
)

# create the executable
custom_target(
  command: [
    gnim, 'bundle',
    prefix / datadir / name / gresource,
    name,
    '--exe',
    '--prefix', app_prefix,
  ],
  output: name,
  install: true,
  install_dir: prefix / bindir,
)

# generate .gschema.xml files
custom_target(
  command: [
    gnim, 'schemas',
    root / 'src',
    '-o', 'schemas',
  ],
  output: 'schemas',
  install: true,
  install_dir: datadir / 'glib-2.0',
)

# install icons
install_subdir(
  'data/icons',
  install_dir: prefix / datadir,
)

# post install scripts
import('gnome').post_install(
  # compiles the system global gschema binary
  glib_compile_schemas: true,
  # updates icons
  gtk_update_icon_cache: true,
  # updates database for .desktop entries
  update_desktop_database: true,
)
```

:::

To build and install your application, run the following commands:

```sh
meson setup build --wipe
meson install -C build
```

> [!IMPORTANT]
>
> The `prefix` option defaults to `/usr/local` which is usually not setup system
> wide on most distributions. You might want to setup meson with the `/usr`
> prefix, but keep in mind that your system pacakge manager will not be aware of
> you installing a package manually.
>
> ```sh
> meson setup build --prefix /usr
> ```

## Flatpak

[Flatpak](https://flatpak.org/) is a framework for distributing desktop
applications on Linux. Below is an example manifest for packaging a Gnim
application.

::: code-group

```yaml [com.example.MyApp.yaml]
app-id: com.example.MyApp
runtime: org.gnome.Platform
runtime-version: "49"
sdk: org.gnome.Sdk
sdk-extensions:
  - org.freedesktop.Sdk.Extension.node22
command: example-myapp
finish-args:
  - --share=ipc
  - --socket=fallback-x11
  - --socket=wayland
  - --device=dri
build-options:
  append-path: /usr/lib/sdk/node22/bin
modules:
  - name: example-app
    buildsystem: meson
    sources:
      - type: dir
        path: .
      - npm-sources.json
```

:::

The `npm-sources.json` file contains the npm dependencies for offline builds.
You can generate it using
[flatpak-builder-tools](https://github.com/flatpak/flatpak-builder-tools/blob/master/node):

::: code-group

```sh [npm]
flatpak-node-generator npm package-lock.json -o npm-sources.json
```

```sh [pnpm]
flatpak-node-generator pnpm pnpm-lock.yaml -o npm-sources.json
```

:::

To build and install the Flatpak locally:

```sh
flatpak-builder --user --install --force-clean build-dir com.example.MyApp.yaml
```

To run the application:

```sh
flatpak run com.example.MyApp
```

> [!TIP]
>
> During development, you can test your app in the Flatpak environment without
> installing:
>
> ```sh
> flatpak-builder --run build-dir com.example.MyApp.yaml example-app
> ```
