project('__app-name__', version: '0.0.0')

name = meson.project_name()
root = meson.project_source_root()
prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')

gnim = find_program('gnim', 'node_modules/.bin/gnim')
app_id = '__app-id__'

# bundle
custom_target(
  command: [gnim, 'bundle', root / 'src' / 'main.ts'],
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
