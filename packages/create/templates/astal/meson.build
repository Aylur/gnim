project('__app-name__', version: '0.0.0')

app_id = '__app-id__'
name = meson.project_name()
root = meson.project_source_root()
prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')
pkgdatadir = prefix / datadir / app_id

gnim = find_program('gnim', 'node_modules/.bin/gnim')

# bundle
custom_target(
  command: [gnim, 'bundle', root / 'src' / 'main.ts'],
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
    '-o', name + '.js',
    '--id', app_id,
    '--prefix', prefix,
    '--datadir', datadir,
  ],
  output: name + '.js',
  install: true,
  install_dir: pkgdatadir,
)

# wrapper
custom_target(
  command: [
    find_program('echo'),
    '#!@0@\nLD_PRELOAD="@1@/libgtk4-layer-shell.so" @2@ $@'.format(
      find_program('bash').full_path(),
      dependency('gtk4-layer-shell-0').get_variable('libdir'),
      pkgdatadir / name + '.js',
    ),
  ],
  output: name,
  capture: true,
  install: true,
  install_dir: prefix / bindir,
  install_mode: 'rwxr-xr-x',
)

# schemas
custom_target(
  command: [gnim, 'schemas', root / 'src', '-o', 'schemas'],
  output: 'schemas',
  install: true,
  install_dir: prefix / datadir / 'glib-2.0',
)
