#!/usr/bin/env nu

def "main dev:types" [] {
    # rm -rf dist
    # rm -rf build
    # tsc
    # mkdir dist
    # glib-compile-resources src/resource.xml --sourcedir=build --target=dist/gnim.gresource
    # cp -r src/* dist/
}

def "main build:types" [] {
    # rm -rf dist
    # rm -rf build
    # tsc
    # mkdir dist
    # glib-compile-resources src/resource.xml --sourcedir=build --target=dist/gnim.gresource
    # cp -r src/* dist/
}

def "main build:gnim" [] {
    # rm -rf dist
    # rm -rf build
    # tsc
    # mkdir dist
    # glib-compile-resources src/resource.xml --sourcedir=build --target=dist/gnim.gresource
    # cp -r src/* dist/
}

def main [] {
    nu $env.CURRENT_FILE --help
}
