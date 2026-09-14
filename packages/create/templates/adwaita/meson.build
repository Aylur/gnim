#% if vala %#
project('__app-name__', 'vala', 'c', version: '0.0.0')
#% else %#
project('__app-name__', version: '0.0.0')
#% endif %#

app_id = '__app-id__'
name = meson.project_name()
root = meson.project_source_root()
prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')
libdir = get_option('libdir')
pkgdatadir = prefix / datadir / app_id
#% if vala %#
pkglibdir = prefix / libdir / app_id
#% endif %#

gnim = find_program('gnim', 'node_modules/.bin/gnim')

#% if vala %#
# vala library
subdir('lib')
#% endif %#

# bundle
custom_target(
  command: [
    gnim,
    'bundle',
    '--id', app_id,
    root / 'src' / 'main.ts',
  ],
  install: true,
  install_dir: pkgdatadir,
  output: 'gresource',
)

# executable
custom_target(
  command: [
    gnim,
    'exe',
    pkgdatadir / 'gresource',
    '-o', name,
    '--id', app_id,
    '--prefix', prefix,
    '--datadir', datadir,
    '--libdir', libdir,
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
  install_dir: prefix / datadir / 'glib-2.0',
)

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
