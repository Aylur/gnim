api_version = '0'
gir_name = '__vala_namespace__-@0@.gir'.format(api_version)
typelib_name = '__vala_namespace__-@0@.typelib'.format(api_version)

sources = files(
  'lib.vala',
)

lib = library(
  name,
  sources,
  dependencies: [
    dependency('glib-2.0'),
    dependency('gobject-2.0'),
    dependency('gio-2.0'),
  ],
  version: api_version,
  install: true,
  install_dir: pkglibdir,
)

gir = custom_target(
  gir_name,
  command: [
    find_program('valadoc'),
    '-o', 'gir',
    '--package-name', name,
    '--gir', '@OUTPUT@',
    '--pkg=gio-2.0',
    sources,
  ],
  depends: lib,
  output: gir_name,
  install: true,
  install_dir: pkgdatadir,
)

custom_target(
  typelib_name,
  command: [
    find_program('g-ir-compiler'),
    '--output', '@OUTPUT@',
    '--shared-library', pkglibdir / 'lib' + name + '.so',
    meson.current_build_dir() / gir_name,
  ],
  output: typelib_name,
  depends: [lib, gir],
  install: true,
  install_dir: pkglibdir,
)
