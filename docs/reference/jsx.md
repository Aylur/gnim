# JSX

Syntactic sugar for creating objects declaratively.

> [!WARNING] This is not React
>
> Gnim shares many concepts with UI rendering libraries like React, Solid, and
> Svelte, but it is its own solution: it is **not React**.

Consider the following example:

```ts
function Box() {
  let counter = 0

  const button = new Gtk.Button()
  const icon = new Gtk.Image({
    iconName: "system-search-symbolic",
  })
  const label = new Gtk.Label({
    label: `clicked ${counter} times`,
  })
  const box = new Gtk.Box({
    orientation: Gtk.Orientation.VERTICAL,
  })

  function onClicked() {
    label.label = `clicked ${counter} times`
  }

  button.set_child(icon)
  box.append(button)
  box.append(label)
  button.connect("clicked", onClicked)
  return box
}
```

Can be written as

```tsx
function Box() {
  const [counter, setCounter] = createState(0)
  const label = computed(() => `clicked ${counter()} times`)

  function onClicked() {
    setCounter((c) => c + 1)
  }

  return (
    <Gtk.Box orientation={Gtk.Orientation.VERTICAL}>
      <Gtk.Button onClicked={onClicked}>
        <Gtk.Image iconName="system-search-symbolic" />
      </Gtk.Button>
      <Gtk.Label label={label} />
    </Gtk.Box>
  )
}
```

## TODO

yet to be written
