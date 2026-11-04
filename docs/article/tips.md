# Tips

## Dialogs as async functions

Dialogs usually ask the user for an input that gets processed further. Instead
of holding an `open` state and wrapping event handlers, it makes more sense to
model them as async functions.

```tsx
// [!code focus:4]
export interface DialogProps<T> {
  ref(dialog: Adw.Dialog): void
  resolve(result: T): void
}

type DialogComponent<T> = (props: DialogProps<T>) => GnimNode
type OpenDialog = <T>(Dialog: DialogComponent<T>) => Promise<T>

const DialogContext = createContext<OpenDialog | null>(null)

// [!code focus:5]
export function useDialog() {
  const ctx = getContext(DialogContext)
  if (!ctx) throw Error("missing DialogContext")
  return ctx
}

export function DialogRoot(props: {
  getWindow(): Adw.Window
  children: GnimNode
}) {
  type DialogState = { Component(): GnimNode } | null

  const { getWindow, children } = props
  const [state, setState] = createState<DialogState>(null)

  const openDialog: OpenDialog = (Dialog) => {
    return new Promise((resolve) => {
      setState({
        // [!code focus:28]
        Component() {
          let dialog: Adw.Dialog

          onMount(() => {
            dialog.present(getWindow())
          })

          onCleanup(() => {
            if (dialog.is_visible()) {
              dialog.close()
              // never resolve
              // or resolve with a default value such as `null`
            }
          })

          return (
            <Dialog
              ref={(self) => (dialog = self)}
              resolve={(result) => {
                resolve(result)
                if (dialog.is_visible()) {
                  dialog.close()
                }
                setState(null)
              }}
            />
          )
        },
      })
    })
  }

  // [!code focus:7]
  return (
    <DialogContext value={openDialog}>
      <Portal>
        <With value={state}>{(s) => s && <s.Component />}</With>
      </Portal>
      {children}
    </DialogContext>
  )
}
```

### Dialog usage

Place `DialogRoot` in a window.

```tsx
<Adw.Window>
  <DialogRoot>
    <AppContent />
  </DialogRoot>
</Adw.Window>
```

Define a dialog that takes `DialogProps<T>`.

```tsx
function MyDialog({ ref, resolve }: DialogProps<string>) {
  return (
    <Adw.Dialog>
      <Gtk.Button onClicked={() => resolve("Hello!")} />
    </Adw.Dialog>
  )
}
```

Use it in the context of the window.

```tsx
function AppContent() {
  // [!code focus:6]
  const openDialog = useDialog()

  async function askUser() {
    const result = await openDialog(MyDialog)
    console.log(result)
  }

  return <Gtk.Button onClicked={() => void askUser()} />
}
```

> [!NOTE]
>
> - Only one dialog is open at a time. Opening another one disposes the previous
>   dialog.
> - Additional props can be passed by wrapping the dialog in an arrow function:
>   ```tsx
>   openDialog((props) => <AddPluginDialog {...props} customProp />)
>   ```
