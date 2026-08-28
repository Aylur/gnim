# Roadmap

The reactive system was implemented from scratch without any prior experience
with similar systems. I did not yet understand the complexity of the problem at
first, so most edge-cases, which there are a lot, were fixed as I encountered
them and so it turned out to be bit of a spaghetti. There are some problems that
currently cannot be fixed with the current implementation so the plan for 2.1 is
a full internal rewrite of the reactive system, without breaking the user facing
API.

## States are synchronous, effects use the microtask queue

Setting a state notifies synchronously, while `effect()`, `<With>`, `<For>` and
child list updates are coalesced and run on the microtask queue.

```ts
const [label, setLabel] = createState("a")
const [items, setItems] = createState(["a"])

setLabel("b")
// property bindings using `label` are already updated here

setItems(["a", "b"])
// children rendered with <For each={items}> update on the next microtask
```

Solid, in comparison, propagates everything synchronously. This is intentional
mainly due to the fact that
[diamond dependencies are not coalesced](#diamond-dependencies-are-not-coalesced).

Planned: make everything synchronous and introduce a `batch()` API.

## Diamond dependencies are not coalesced

When a computed depends on two accessors that both derive from the same source,
updating the source notifies direct subscribers twice — first with an
inconsistent intermediate value:

```ts
const [s, setS] = createState(1)
const a = computed(() => s() * 10)
const b = computed(() => s() * 100)
const sum = computed(() => a() + b())

sum.subscribe(() => console.log(sum()))
setS(2)
// logs 120 (a updated, b still stale), then 220
```

Effects are protected from this because the microtask queue deduplicates
re-runs, but `subscribe()` callbacks and JSX property bindings suffer from this.

Planned: propagate updates in topological order so that observers are only ever
notified with consistent values.

## Reactive text children are recreated on every change

A text child from an accessor destroys the previous text node and constructs a
new one each time the value changes, instead of updating the existing node's
label in place.

This is not a big issue, since it can be fixed from user code by using the text
node directly and using its label property instead.

Planned: introduce an `updateText` Renderer API and update the existing text
node in place.

## Error boundaries

An effect that throws is logged with `console.error` and there is no way for
application code to catch these errors. The exception is
`effect(fn, { immediate: true })`, which runs synchronously at the call site and
therefore throws to the caller like any other synchronous code.

Planned: an `ErrorBoundary` mechanism that will let users catch errors coming
from a subtree instead of them only being logged to the console.

## Suspense boundaries

There is currently no builtin support for async mechanisms.

Planned: `Suspense` that displays a fallback component while its subtree is
doing async work.

## Dev server

The CLI is written in Rust and uses Rolldown's Rust API. Since it is not a
Rolldown plugin it is impossible to use it with other plugins. This decision was
mostly because I wanted to fit it into a single binary so that there is no
dependency on Node and npm packages to make it is easier to distribute.

Planned: rewrite it in TypeScript as a Rolldown plugin.
