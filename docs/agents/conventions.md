# Code Conventions

Conventions for writing Gnim applications. They are meant for coding agents:
follow them unless the project you are working in clearly does something
different, in which case match the project.

## Project setup

- Use strict TypeScript with at least `strict` and `noUncheckedIndexedAccess`.
- Use the `#/*` path alias for imports from `src/`.

  ```json
  {
    "compilerOptions": {
      "paths": { "#/*": ["./src/*"] }
    }
  }
  ```

- Lint with `typescript-eslint`'s `strict` config.
- Format with Prettier or oxfmt: no semicolons, double quotes, trailing commas.
- Run the type checker and linter after making changes. Regenerate types with
  `gnim types` when a `gi://` import is missing types; never write type
  declarations for GObject Introspection libraries by hand.

## File layout

- One component per file, exported with `export default function`.
- Name files after the component they export, in PascalCase: `PluginRow.tsx`.
- When a component grows sub-components, turn it into a folder with an
  `index.tsx` and keep the sub-components next to it.

  ```txt
  src/
  ├── main.ts
  ├── globals.ts
  └── App/
      ├── index.tsx
      └── AppContent/
          ├── index.tsx
          ├── EmptyPage.tsx
          └── PluginRow/
              ├── index.tsx
              └── ParameterRow.tsx
  ```

- Small helper components used by a single file may stay in that file,
  unexported.
- Keep files small. Split a component when it no longer fits on a screen or two.

## Components

- Prefer function components. Only subclass a widget when you need to override a
  virtual function.
- Destructure props in a single statement at the top of the component, with
  default values in the destructuring.
- Type callback props as methods and give them semantic names that pass values
  out, not widgets.

  ```tsx
  export default function ParameterRow(props: {
    parameter: Parameter
    onChange(value: number): void
  }) {
    const { parameter, onChange } = props

    return (
      <Adw.ActionRow title={parameter.name}>
        <Gtk.Scale
          slot="suffix"
          adjustment={
            <Gtk.Adjustment
              value={parameter.value}
              onValueChanged={(self) => onChange(self.value)}
            />
          }
        />
      </Adw.ActionRow>
    )
  }
  ```

- Order body of a component

  ```tsx
  function Component(props: {}) {
    // props
    const {} = props
    const $p = prop()

    // refs
    let ref: Gtk.Widget

    // contexts, bindings and anything non-derived value
    const ctx = getContext(SomeContext)
    const field = bind(object, "field")
    const c = useSomething()

    // states and anything derived
    const [] = createState()

    // computeds and derived values
    const c = computed(() => [])

    // internal functions such as event handlers
    function onClick() {}

    // effects
    effect(() => {})
    connectSignal()
    subscribe()

    // onMount and onCleanup
    onMount()
    onCleanup()

    // JSX
    return <></>
  }
  ```

- Inline the props type for app components. Name it with an `interface` when it
  is reused or exported: `interface DialogProps<T>`.
- Prefer properties over imperative calls: `visible={isEmpty}` instead of
  calling `set_visible()` in an effect.
- Name event handlers after what they do (`addPlugin`, `toggleEditor`) and
  define them as functions in the component body when they are more than a
  single expression.

### Refs

Store widget references in a typed `let` assigned in `ref`. Only access them
after the component has mounted: in `onMount`, `effect`, or event handlers.

```tsx
let entry: Gtk.SearchEntry

onMount(() => {
  entry.set_key_capture_widget(window)
})

return <Gtk.SearchEntry ref={(self) => (entry = self)} />
```

When a component also accepts a `ref` prop, forward it with an array:
`ref={[ref, (self) => (dialog = self)]}`.

### Reusable primitive components

Components meant to be reused across an application or published as a library
follow a stricter style.

- Use named exports, and declare the props in a namespace of the same name.

  ```tsx
  export namespace Button {
    export type Variant = "flat" | "solid"
    export interface Props {
      variant?: MaybeAccessor<Variant>
      disabled?: MaybeAccessor<boolean>
      children?: GnimNode
      onPressed?(): void
    }
  }

  export function Button(props: Button.Props) {
    const { variant = "flat", disabled = false, children, onPressed } = props
    const $variant = prop(variant)

    return (
      <Gtk.Button
        class={$variant.as((v) => `button-${v}`)}
        sensitive={prop(disabled).as((d) => !d)}
        onClicked={() => onPressed?.()}
      >
        {children}
      </Gtk.Button>
    )
  }
  ```

- Accept `MaybeAccessor<T>` for props that can change, and normalize them with
  `prop()`. Prefix locals holding such accessors with `$`.
- Use string literal unions for options, not GTK enum values.
- Make them controlled: the parent owns the state and passes the accessor and a
  setter, for example `<ListBox value={fruit} onChange={setFruit} />`.

## Reactivity

- Use `createState` for local state and keep it in the component that owns it.
- Use `.as()` for cheap single-dependency mappings and `computed()` for values
  that depend on multiple accessors or are expensive.

  ```ts
  const canSearch = plugins.as((p) => p.length > 1)

  const filtered = computed(() => {
    const query = search().trim().toLowerCase()
    return plugins().filter((p) => p.name.toLowerCase().includes(query))
  })
  ```

- Use `bind(object, "property")` to read GObject properties reactively and
  `connectSignal` to connect to signals; both disconnect when the scope is
  disposed.
- Use `.peek()` to read a value inside event handlers, callbacks and anywhere
  else where tracking is not wanted.
- Use `effect` only to synchronize with imperative APIs, with one effect per
  concern. Do not use effects to derive state, use `computed` instead.
- Wrap multiple related state updates in `batch`.
- Release resources that are not tied to a widget, such as `GLib` sources, in
  `onCleanup`.

  ```ts
  let source: number | null = null

  onCleanup(() => {
    if (source !== null) GLib.source_remove(source)
  })
  ```

- Render lists with `<For>` and pass an `id` function when items are not stable
  objects.

  ```tsx
  <For each={plugins} id={(plugin) => plugin.path}>
    {(plugin) => <PluginRow plugin={plugin} />}
  </For>
  ```

- Use `<With>` for content that depends on a single value, and `<Portal>` for
  toplevels like dialogs.

## Async and errors

- Wrap callback based Gio `_async`/`_finish` pairs in a `Promise` at the module
  boundary, do not leak callbacks into components.

  ```ts
  function save(dialog: Gtk.FileDialog, parent: Gtk.Window): Promise<Gio.File> {
    return new Promise((resolve, reject) => {
      dialog.save(parent, null, (_, res) => {
        try {
          resolve(dialog.save_finish(res))
        } catch (error) {
          reject(error)
        }
      })
    })
  }
  ```

- Every promise must be awaited or end in a `.catch()`. Use `void` only when the
  promise handles its own errors.
- Show errors caused by user actions to the user, for example with a toast. Log
  everything else with `logError`, which prints source mapped stack traces
  unlike `console.error`.

  ```ts
  proxy
    .Method()
    .catch((error) =>
      logError(Error.isError(error) ? error : Error(String(error))),
    )
  ```

- `logError` only accepts `Error` and `GLib.Error` instances, so narrow unknown
  values before passing them.
- Check expected errors with `GLib.Error.prototype.matches` instead of comparing
  messages, and handle them explicitly.

  ```ts
  try {
    const file = await open(dialog, window)
  } catch (error) {
    const dismissed =
      error instanceof GLib.Error &&
      error.matches(Gtk.DialogError, Gtk.DialogError.DISMISSED)

    if (!dismissed) logError(error)
  }
  ```

- Call `Gio.DBusError.strip_remote_error` on DBus errors before showing them to
  users.

## Text and internationalization

- Mark every user-visible string as translatable with `gettext`.
- Use `sfmt` with placeholders instead of string concatenation, and ICU plural
  syntax or `ngettext` for counts.

  ```ts
  sfmt(t("{count, plural, =1 {# plugin} other {# plugins}}"), { count })
  ```

## Styling

- Prefer Adwaita's style classes (`pill`, `flat`, `suggested-action`,
  `destructive-action`, `dimmed`, `boxed-list`) and widgets over custom CSS.
- Put custom CSS next to the component in a `style.css` and import it as the
  first import of the file.

  ```ts
  import "./style.css"
  ```

- Scope CSS with a class on the component's root widget, or a `cssName` for
  reusable components, and use nesting.

  ```css
  gridview.icon-grid {
    padding: 12px;

    child:hover {
      background: alpha(currentColor, 0.07);
    }
  }
  ```

- Use `style()` from `@gnim-js/gtk4` for dynamic styles instead of building CSS
  strings.
- Use CSS variables and `currentColor` instead of hard-coded colors so the app
  follows the system theme.

## TypeScript

- Do not use `any`. Use `unknown` and narrow it with `typeof` or `instanceof`.
- Do not use TypeScript `enum`s. Use string literal unions or `as const`
  objects.

  ```ts
  export const ParameterFlags = {
    STEPPED: 1,
    READ_ONLY: 2,
    HIDDEN: 4,
  } as const
  ```

- Represent missing values with `null` (`T | null`) and optional props with
  `?:`. Do not use `undefined` explicitly.
- Avoid non-null assertions. Use them only when a value is guaranteed, such as
  `Gdk.Display.get_default()!` in a graphical application.
- Annotate return types of exported functions that are not components.

## Comments

- Comment why, not what. Explain GTK quirks and non-obvious decisions, and link
  upstream issues for workarounds.

  ```ts
  // https://gitlab.gnome.org/GNOME/libadwaita/-/merge_requests/1844
  ```

- Do not leave commented-out code or debug `console.log` calls behind.
