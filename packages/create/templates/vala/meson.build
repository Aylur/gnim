project('__app-name__', 'vala', 'c', version: '0.0.0')

app_id = '__app-id__'
name = meson.project_name()
root = meson.project_source_root()
prefix = get_option('prefix')
datadir = get_option('datadir')
bindir = get_option('bindir')
libdir = get_option('libdir')
pkgdatadir = prefix / datadir / app_id
pkglibdir = prefix / libdir / app_id

gnim = find_program('gnim', 'node_modules/.bin/gnim')

# vala library
subdir('lib')

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
