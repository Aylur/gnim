# Dev server

The `gnim dev` command is a simple HMR implementation which

- in `.tsx` and `.jsx` modules will wrap exported function components such that
  it will always run the most up to date implementation on file changes.
- hooks into `createState()` calls such that it will try to persist their state
  across HMR triggers by tracking their current value based on the position they
  are invoked and their initial value.
- overrides `GObject.registerClass()` such that it overrides `GTypeName` across
  HMR triggers to allows the runtime to continue without crashing, but without
  updating the slots that the type is used in. To update slots you also need to
  trigger HMR in the components that use the class.

When a component's implementation changes, it will cleanup the previous effects
and will simply re-instantiate the widgets. It does not do any diffing
currently.

The `dev` command assumes that Application activation (`Gio.Application.run`)
happens in the entry file and so when the entry file changes the application is
simply restarted.

> [!IMPORTANT]
>
> Currently only these syntax will be recognised as a component for HMR:
>
> ```tsx
> export const Comp = () => {}
> export function Comp() {}
> export default function Comp() {}
>
> // this does not yet work
> function Comp() {}
> export { Comp }
> export default Comp
> ```
