# Changelog

## 2.0.0

- Rewrote the reactive system
  - Changed `Accessor` from a class into a callable function type: read with
    `accessor()`, use `isAccessor` instead of `instanceof Accessor`
  - Renamed `createComputed` to `computed`, which is lazy and memoized and
    replaces `createMemo`
  - Renamed `createEffect` to `effect` and added `renderEffect`, which runs
    immediately and replaces the `immediate: true` option
  - Renamed `createBinding` to `bind`, which also binds to store fields
  - Replaced `createExternal` and `new Accessor(get, subscribe)` with
    `createAccessor(get, subscribe)`
  - Removed `createConnection` in favour of `createState` combined with
    `connectSignal`
  - Added `batch`, `untrack` and a standalone `subscribe`
  - Added `createStore`, a reactive object whose getters become computed fields
  - Added `prop` and the `MaybeAccessor` type for function component props that
    can be either plain values or accessors
  - Replaced `ctx.use()` and `ctx.provide()` with `getContext` and `setContext`
  - Added `runScope`, and `createRoot` can now take a parent scope
  - Effects and life-cycle hooks that throw no longer break the reactive system

- Rewrote JSX rendering
  - `jsx()` and JSX expressions now return a plain element description instead
    of instantiating objects, and the renderer instantiates the tree when it is
    mounted
  - Changed the JSX import source to `gnim` instead of `gnim/gtk4`, `gnim/gtk3`
    or `gnim/gnome`
  - Mount JSX trees with a `render()` function, which returns a dispose function
  - Renamed the special attributes `$` → `ref`, `$type` → `slot` and
    `$constructor` → `construct`
  - Removed `<This>` and `getType`; use `getSlot` to read back the `slot`
    attribute
  - Removed the `cleanup` prop from `<For>` and `<With>` in favour of
    `onCleanup`
  - Renamed the `Node` type to `GnimNode` and removed `FCProps`, and `jsx` is no
    longer exported from the package root
  - Added `<Portal>`, which renders its children into a different mount point
  - Added `Gio.ListModel` support to `<For>`

- Changed the GObject decorators from stage3 to stage2 decorators
  - Removed `@getter()` and `@setter()`; use `@property` on `get`/`set`
    accessors instead
  - Added support for `emitDecoratorMetadata`; `@property`, `@signal` and
    `@register` work without explicit runtime type arguments
  - Added the `Annotations` type helper for typed `connect()` and `notify()`

- Replaced the DBus decorators with interface creation functions
  - Removed the `Service` class and the decorators
  - Declare interfaces with `createDBusInterface(name, { ... })`
  - Added `serve()` and `proxy()`.

- Added type-safe abstraction over GSettings schemas
  - Define schemas in TypeScript with `Schema`, `defineSchemaList`, `Enum` and
    `Flags`
  - Supports variant defaults, translatable values and relocatable schemas
  - Moved `createSettings` here; it can infer key types from a `Schema`
  - Schemas are compiled with `gnim schemas`

- Added `gnim` CLI
  - `gnim dev`: a dev server with HMR for components and CSS, schema
    autocompilation, icon registration
  - `gnim bundle`: bundles the app and its assets into a gresource
  - `gnim exe`: generates a launcher script for the bundle
  - `gnim types`: generates TypeScript definitions from installed GIR files
  - `gnim schemas`: compiles schemas written in TypeScript
  - Added CSS, Sass and SCSS imports, including color scheme variants, and
    `?file` asset imports

- Added internationalization (`gnim/intl`)
  - Added gettext domains with `createDomain`
  - Added locale detection with `getLocale` and `getPreferredLocale`
  - Added ICU message formatting via `intl-messageformat` with `fmt` and `sfmt`

- Moved the renderers into their own packages
  - Added `@gnim-js/gtk4`, `@gnim-js/gtk3` and `@gnim-js/gnome-shell`
  - The GTK `class` attribute accepts strings, nested arrays and accessors
  - Added experimental CSS-in-JS (`style`, `keyframes`) to `@gnim-js/gtk4`
  - Added `createListItemFactory` to `@gnim-js/gtk4`
  - Added child handling for many more GTK 4 and Adwaita widgets
  - `@gnim-js/gtk3` follows the same rules and conventions as `@gnim-js/gtk4`
  - `@gnim-js/gnome-shell` ships types and GIR files for GNOME Shell

- Added the `@gnim-js/web` package
  - Replaces `gnim/fetch`
  - Provides `fetch`, `Request`, `Response`, `Headers`, `URL`,
    `URLSearchParams`, `Blob`, `File` and `FormData`, registered as GObjects
  - Added `serve`, an experimental HTTP server built on `Soup.Server`

- Lowered the minimum GJS version from 1.79 to 1.74

## 1.9.0

- Added `createEffect`
- Changed accessors to be callable for tracked reads
- Changed `createComputed` to track dependencies automatically
- Added support for nested effects
- Added `createMemo`
- Added an `equals` option to `createState`
- Added nested property paths to `createBinding`
- Fixed bindings on objects that override `connect`

## 1.8.0

- Changed the GObject and DBus decorators to allow subtype-compatible signatures
- Fixed `<With>` re-rendering when the value had not changed
- Fixed `createComputed([deps], fn)` reading each dependency twice

## 1.7.0

- Fixed text children in the GNOME Shell runtime
- Fixed `createComputed` with a producer function returning a stale initial
  value
- Fixed Fragments as children of objects with a custom `[appendChild]`
- Changed computed accessors to cache their values

## 1.6.2

- Fixed `<This>` requiring every property

  The props of `<This>` are now all optional.

## 1.6.0

- Fixed appending to and removing from Fragments
- Added JSX support for detailed signals: `onSignalName:detail={...}`
- Changed the `addChild` symbol to `appendChild`
- Changed `<This>` to accept the same props as class components

## 1.5.0

- Added the `addChild` and `removeChild` symbols
- Fixed `<With>` leaking its children
- Fixed `<With>` disposing its scope twice
- Fixed the disposal order in `<For>` and `<With>`

## 1.4.0

- Added `$gtype` to the builtin `Map` and `Set`
- Added exports for the `Context` and `Scope` types
- Deprecated `createBinding` on `Gio.Settings`
- Fixed accessor subscribers being skipped or run twice when a callback
  subscribes or unsubscribes while being notified
- Added `createComputed` with a producer function
- Deprecated `createComputed` dependency list syntax

## 1.3.0

- Added GVariant type parsers
- Changed `createSettings` accessors to recursively unpack values
- Fixed `createConnection` on objects that override `connect` or `disconnect`
- Added a `default` option to the `@signal` decorator
- Fixed registering classes that derive from an already decorated GObject
  subclass
- Fixed function components receiving `children: []` when no children were
  passed
- Added a bundled gresource of the library
- Added `$gtype` to the builtin `Date`
- Fixed event controllers not being removable from GTK 4 widgets

## 1.2.0

- Added `createSettings`

## 1.1.0

- Added support for GObject decorators in DBus decorated `Service` classes

## 1.0.0

- Initial release
