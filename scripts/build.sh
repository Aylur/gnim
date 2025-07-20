#!/usr/bin/env bash

set -euxo pipefail

rm -rf dist
rm -rf build
tsc
mkdir dist
glib-compile-resources src/resource.xml --sourcedir=build --target=dist/gnim.gresource
cp -r src/* dist/
