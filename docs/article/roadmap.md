# Roadmap

The reactive system was rewritten for 2.0 on top of the propagation algorithm of
[alien-signals](https://github.com/stackblitz/alien-signals). Updates are
synchronous, propagate in topological order and can be grouped with `batch()`.

## Reactive text children are recreated on every change

A text child from an accessor destroys the previous text node and constructs a
new one each time the value changes, instead of updating the existing node's
label in place.

This is not a big issue, since it can be fixed from user code by using the text
node directly and using its label property instead.

Planned: introduce an `updateText` Renderer API and update the existing text
node in place.

## Error boundaries

Errors simply propagate to the code that triggered them which makes it
essentially impossible to track down since it is usually Gnim internals and user
code is nowhere to be seen on the stack.

Planned: an `ErrorBoundary` component that exposes mechanism to catch errors and
recover from them.

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
