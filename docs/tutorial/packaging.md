# Packaging

This page covers how to package your Gnim application for distribution. It
explains how to use Meson as a build system and how to create Flatpak packages.

## Desktop entry

To make your application show up in application lists/drawers on desktops so
that users can launch the app in a graphical interface you have to create an
[entry](https://specifications.freedesktop.org/desktop-entry/latest/).

Create a `data/entry.desktop` file.

```ini
[Desktop Entry]
Name=My Awesome Application
Comment=Do awesome stuff
Icon=@app_id@
Exec=@exe@
Type=Application
```

The name of the file and keys such as `Icon` and `Exec` will be configured using
[`Meson`](#meson).

> [!TIP]
>
> Read through the
> [spec](https://specifications.freedesktop.org/desktop-entry/latest/recognized-keys.html)
> and add common keys such as `Categories` and `Keywords` to help users find the
> application.

### Application Icon

The icon is what makes the application immediately recognizable by users. It has
to convey the function of the app, be visually appealing and yet be simple. To
help with that, the GNOME Human Interface Guidelines have a
[guide for drawing such an icon](https://developer.gnome.org/hig/guidelines/app-icons.html).

Because these icons need to be accessible from outside the application, we can't
ship them in the resource bundle. Instead, we have to install them on the
system, in a well-known place: the `apps` category of the `hicolor` icon theme,
following the
[Icon Theme specification](https://specifications.freedesktop.org/icon-theme-spec/icon-theme-spec-latest.html).

## Meson

[Meson](https://mesonbuild.com/) is a build system commonly used for GNOME
projects. It handles compilation, bundling, and installation of your
application. The following example shows how to configure Meson to bundle your
Gnim applications.

::: code-group

```meson [meson.build]
# project name should be the name of the executable
project('example-myapp', version: '0.0.0')

name = meson.project_name()
root = meson.project_source_root()
prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')

gnim = find_program('gnim', 'node_modules/.bin/gnim')
app_id = 'com.example.MyApp'

# bundle
custom_target(
  command: [gnim, 'bundle', root / 'src' / 'main.tsx'],
  install: true,
  install_dir: prefix / datadir / app_id,
  output: 'gresource',
)

# executable
custom_target(
  command: [
    gnim,
    'exe',
    prefix / datadir / app_id / 'gresource',
    '--id', app_id,
    '-o', name,
  ],
  output: name,
  install: true,
  install_dir: prefix / bindir,
)

# schemas
custom_target(
  command: [gnim, 'schemas', root / 'src', '-o', 'schemas'],
  output: 'schemas',
  install: true,
  install_dir: datadir / 'glib-2.0',
)

# translations
foreach lang : ['de', 'es', 'fr', 'it']
  custom_target(
    command: [
      'msgfmt',
      root / 'po' / lang + '.po',
      '-o', app_id + '.mo',
    ],
    output: app_id + '.mo',
    install: true,
    install_dir: prefix / datadir / 'locale' / lang / 'LC_MESSAGES',
  )
endforeach

# desktop entry
configure_file(
  input: 'data' / 'entry.desktop',
  output: app_id + '.desktop',
  configuration: {
    'app_id': app_id,
    'exe': prefix / bindir / name,
  },
  install: true,
  install_dir: prefix / datadir / 'applications',
)

# application icons
install_data(
   'data' / 'icons' / app_id + '.svg',
  install_dir: prefix / datadir / 'icons' / 'hicolor' / 'scalable' / 'apps',
)
install_data(
  'data' / 'icons' / app_id + '-symbolic.svg',
  install_dir: prefix / datadir / 'icons' / 'hicolor' / 'symbolic' / 'apps',
)

# post install
import('gnome').post_install(
  glib_compile_schemas: true,
  gtk_update_icon_cache: true,
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
> The `prefix` option defaults to
> [`/usr/local`](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch04s09.html)
> which is usually not setup system wide on most distributions. For example:
>
> - `/usr/local/bin` might not be in `$PATH`,
> - icons from `/usr/local/share/icons` might not be sourced,
> - desktop entries in `/usr/local/share/applications` might not be in the
>   search path
>
> You might want to setup meson with the `/usr` prefix, but keep in mind that
> your system package manager will not be aware of you installing a package
> manually and it is a violation of
> [FHS](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch04s09.html). Try
> installing to `~/.local` instead and make the above list is satisfied.
>
> ```sh
> meson setup build --prefix "$HOME/.local"
> ```
>
> You should refer to your Linux distribution of choice on how to create
> packages so you can use your system package manager to install.

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
  - name: example-myapp
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
> flatpak-builder --run build-dir com.example.MyApp.yaml example-myapp
> ```
