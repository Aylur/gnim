# Dev server

The `gnim dev` command is a simple HMR implementation which

- in `.tsx` and `.jsx` modules will wrap exported function components such that
  it will always run the most up-to-date implementation on file changes.
- hooks into `createState()` calls such that it will try to persist their state
  across HMR triggers by tracking their current value based on the position they
  are invoked and their initial value.
- overrides `GObject.registerClass()` such that it overrides `GTypeName` across
  HMR triggers to allow the runtime to continue without crashing, but without
  updating the slots that the type is used in. To update slots you also need to
  trigger HMR in the components that use the class.
- intercepts `.css` imports and adds css providers to Gtk.
- compiles `.po` translation files and provides them to the runtime on startup
  using the given application id.

When a component's implementation changes, it will clean up the previous effects
and will simply re-instantiate the widgets. It does not do any diffing
currently.

The `dev` command assumes that Application activation (`Gio.Application.run`)
happens in the entry file and so when the entry file changes the application is
simply restarted.

## Gotchas

### Component syntax

Currently only this syntax is recognized as a component for HMR:

```tsx
export const Comp = () => {}
export function Comp() {}
export default function Comp() {}

// this does not yet work
function Comp() {}
export { Comp }
export default Comp
```

### CSS

Currently CSS transitive imports are not tracked; only the root CSS file
imported from TypeScript code is tracked. When updating `component.css`, it's
also required to save `style.css` to trigger HMR.

```css
/* style.css */
@import "./component.css";
```

```css
/* component.css */
button {
  border: 1px solid red;
}
```

When removing a CSS import, it will not remove the corresponding provider. As a
workaround, trigger HMR with an empty CSS file before removing the import.

### Translations

Translation `.po` files are not tracked. The dev server needs to be restarted on
translation changes.
