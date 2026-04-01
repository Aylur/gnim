# Web framework comparisons

This page shows a list of small snippets comparing Gnim's syntax and semantics
compared to popular rendering libraries for the web such as React, Vue and
Svelte.

## Why build another library?

The reason Gnim implements its own reactivity and rendering model is that
popular libraries such as React, Vue, Svelte, and Solid all assume HTML
semantics. Implementing custom renderers for these libraries would introduce
additional complexity, so Gnim was built with Gtk in mind.

::: details

These libraries assume that primitive HTML elements such as `input`, `div`, and
`button` can be safely traversed from parent to child, child to parent, and
between siblings, and that the library can manage their lifetimes. This is not
the case with Gtk. Gtk widgets may have internal children whose lifetimes are
managed by the widget itself, and there is no built-in way to traverse the
widget tree without encountering an internal element. Navigating from child to
parent or between siblings may land on an internal element, and there is no way
to distinguish these from user-defined elements.

In GObject and Gtk, there are also `construct-only` properties that cannot be
mutated after instantiation. This concept cannot be modeled in these libraries
because they assume that any property can be mutated.

:::

## Reactivity

::: code-group

```tsx [Gnim]
import { createState, computed } from "gnim"

export default function DoubleCount() {
  const [count, setCount] = createState(10)
  const doubleCount = computed(() => count() * 2)

  function onEvent() {
    setCount((prev) => prev + 1)
  }

  return <Component>{doubleCount}</Component>
}
```

```tsx [React]
import { useState } from "react"

export default function DoubleCount() {
  const [count, setCount] = useState(10)
  const doubleCount = count * 2

  function onEvent() {
    setCount((prev) => prev + 1)
  }

  return <Component>{doubleCount}</Component>
}
```

```vue [Vue]
<script setup>
import { ref, computed } from "vue"

const count = ref(10)
const doubleCount = computed(() => count.value * 2)

function onEvent() {
  count.value += 1
}
</script>

<template>
  <Component>{{ count }}</Component>
</template>
```

```svelte [Svelte]
<script>
  let count = $state(10);
  const doubleCount = $derived(count * 2);

  function onEvent() {
    count += 1
  }
</script>

<Component>{doubleCount}</Component>
```

:::

## Templating

### Styling

::: code-group

```tsx [Gnim]
import "./style.css" // .title { color: red; }

export default function CssStyle() {
  return (
    <>
      <Heading class="title">I am red</Heading>
      <Button css="font-size: 2rem;">I am a button</Button>
    </>
  )
}
```

```tsx [React]
import "./style.css" // .title { color: red; }

export default function CssStyle() {
  return (
    <>
      <Heading className="title">I am red</Heading>
      <Button style={{ fontSize: "2rem" }}>I am a button</Button>
    </>
  )
}
```

```vue [Vue]
<template>
  <Heading class="title">I am red</Heading>
  <Button style="font-size: 2rem">I am a button</Button>
</template>

<style scoped>
.title {
  color: red;
}
</style>
```

```svelte [Svelte]
<Heading class="title">I am red</Heading>
<Button style="font-size: 2rem;">I am a button</Button>

<style>
  .title {
    color: red;
  }
</style>
```

:::

### Loop

::: code-group

```tsx [Gnim]
import { For, createState } from "gnim"

export default function Colors() {
  const [colors] = createState(["red", "green", "blue"])

  return <For each={colors}>{(color) => <Text>{color}</Text>}</For>
}
```

```tsx [React]
export default function Colors() {
  const colors = ["red", "green", "blue"]

  return (
    <>
      {colors.map((color) => (
        <Text key={color}>{color}</Text>
      ))}
    </>
  )
}
```

```vue [Vue]
<script setup>
const colors = ["red", "green", "blue"]
</script>

<template>
  <Text v-for="color in colors" :key="color">
    {{ color }}
  </Text>
</template>
```

```svelte [Svelte]
<script>
  const colors = ["red", "green", "blue"];
</script>

{#each colors as color (color)}
  <Text>{color}</Text>
{/each}
```

:::

### Events

::: code-group

```tsx [Gnim]
import { createState } from "gnim"

export default function Counter() {
  const [count, setCount] = createState(0)

  function incrementCount() {
    setCount((count) => count + 1)
  }

  return <Button onClick={incrementCount}>+1</Button>
}
```

```tsx [React]
import { useState } from "react"

export default function Counter() {
  const [count, setCount] = useState(0)

  function incrementCount() {
    setCount((count) => count + 1)
  }

  return <Button onClick={incrementCount}>+1</Button>
}
```

```vue [Vue]
<script setup>
import { ref } from "vue"

const count = ref(0)

function incrementCount() {
  count.value++
}
</script>

<template>
  <Button @click="incrementCount">+1</Button>
</template>
```

```svelte [Svelte]
<script>
  let count = $state(0);

  function incrementCount() {
    count++;
  }
</script>

<Button onclick={incrementCount}>+1</Button>
```

:::

### Dom ref

> [!NOTE]
>
> In GTK there is no "DOM" they are called widgets.

::: code-group

```tsx [Gnim]
import { effect } from "gnim"

export default function FocusedEntry() {
  let entry: Gtk.Entry

  effect(() => {
    entry.grab_focus()
  })

  return <Gtk.Entry ref={(ref) => (entry = ref)} />
}
```

```tsx [React]
import { useEffect } from "react"

export default function FocusedEntry() {
  const entryRef = useRef<Gtk.Entry>(null)

  useEffect(() => {
    entryRef.current?.grab_focus()
  }, [])

  return <Gtk.Entry ref={entryRef} />
}
```

```vue [Vue]
<script setup lang="ts">
import { useTemplateRef, onMounted } from "vue"

const entryRef = useTemplateRef<Gtk.Entry>("entryRef")

onMounted(() => {
  entryRef.value?.grab_focus()
})
</script>

<template>
  <GtkEntry ref="entryRef" />
</template>
```

```svelte [Svelte]
<script lang="ts">
  let entry: Gtk.Entry;

  $effect(() => {
    entry.grab_focus();
  });
</script>

<Gtk.Entry bind:this={entry} />
```

:::

### Conditional

::: code-group

```tsx [Gnim]
import { createState } from "gnim"

const TRAFFIC_LIGHTS = ["red", "orange", "green"]

export default function TrafficLight() {
  const [lightIndex, setLightIndex] = createState(0)
  const light = computed(() => TRAFFIC_LIGHTS[lightIndex()])

  function nextLight() {
    setLightIndex((lightIndex.peek() + 1) % TRAFFIC_LIGHTS.length)
  }

  return (
    <>
      <Button onClick={nextLight}>Next light</Button>
      <Text content={light((v) => `Light is: ${v}`)} />
      <Box>
        You must
        <With value={light}>
          {(light) => (
            <>
              {light === "red" && <Span>STOP</Span>}
              {light === "orange" && <Span>SLOW DOWN</Span>}
              {light === "green" && <Span>GO</Span>}
            </>
          )}
        </With>
      </Box>
    </>
  )
}
```

```tsx [React]
import { useState } from "react"

const TRAFFIC_LIGHTS = ["red", "orange", "green"]

export default function TrafficLight() {
  const [lightIndex, setLightIndex] = useState(0)
  const light = TRAFFIC_LIGHTS[lightIndex]

  function nextLight() {
    setLightIndex((lightIndex + 1) % TRAFFIC_LIGHTS.length)
  }

  return (
    <>
      <Button onClick={nextLight}>Next light</Button>
      <Text content={`Light is: ${light}`} />
      <Box>
        You must
        {light === "red" && <Span>STOP</Span>}
        {light === "orange" && <Span>SLOW DOWN</Span>}
        {light === "green" && <Span>GO</Span>}
      </Box>
    </>
  )
}
```

```vue [Vue]
<script setup>
import { ref, computed } from "vue"

const TRAFFIC_LIGHTS = ["red", "orange", "green"]
const lightIndex = ref(0)
const light = computed(() => TRAFFIC_LIGHTS[lightIndex.value])

function nextLight() {
  lightIndex.value = (lightIndex.value + 1) % TRAFFIC_LIGHTS.length
}
</script>

<template>
  <Button @click="nextLight">Next light</Button>
  <Text :content="`Light is: ${light}`" />
  <Box>
    You must
    <Span v-if="light === 'red'">STOP</Span>
    <Span v-else-if="light === 'orange'">SLOW DOWN</Span>
    <Span v-else-if="light === 'green'">GO</Span>
  </Box>
</template>
```

```svelte [Svelte]
<script>
  const TRAFFIC_LIGHTS = ["red", "orange", "green"];
  let lightIndex = $state(0);
  const light = $derived(TRAFFIC_LIGHTS[lightIndex]);

  function nextLight() {
    lightIndex = (lightIndex + 1) % TRAFFIC_LIGHTS.length;
  }
</script>

<Button onclick={nextLight}>Next light</Button>
<Text content={`Light is: ${light}`} />
<Box>
  You must
  {#if light === "red"}
    <Span>STOP</Span>
  {:else if light === "orange"}
    <Span>SLOW DOWN</Span>
  {:else if light === "green"}
    <Span>GO</Span>
  {/if}
</Box>
```

:::

## Lifecycle

::: code-group

```tsx [Gnim]
import { effect, onCleanup } from "gnim"

export default function PageTitle() {
  effect(() => {
    console.log("mounted")
  })

  onCleanup(() => {
    console.log("unmounted")
  })

  return <></>
}
```

```tsx [React]
import { useEffect } from "react"

export default function PageTitle() {
  useEffect(() => {
    console.log("mounted")
  }, [])

  useEffect(() => {
    return () => {
      console.log("unmounted")
    }
  }, [])

  return <></>
}
```

```vue [Vue]
<script setup>
import { onMounted, onUnmounted } from "vue"

onMounted(() => {
  console.log("mounted")
})

onUnmounted(() => {
  console.log("unmounted")
})
</script>

<template></template>
```

```svelte [Svelte]
<script>
  $effect(() => {
    console.log("mounted")
  });

  $effect(() => {
    return () => {
      console.log("unmounted")
    }
  });
</script>
```

:::

## Component composition

### Props

> [!NOTE]
>
> In Gnim, props are explicitly declared whether they can be reactive due to
> GObjects having possible `construct-only` properties that cannot be mutated
> after instantiation.

::: code-group

```tsx [Gnim]
// UserProfile.tsx
import { MaybeAccessor, prop } from "gnim"

export default function UserProfile(props: {
  name?: MaybeAccessor<string>
  age?: MaybeAccessor<number>
}) {
  const name = prop(props.name, "")
  const age = prop(props.age)

  return (
    <Text>
      My name is {name} and my age is {age}!
    </Text>
  )
}

// App.tsx
import UserProfile from "./UserProfile"

export default function App() {
  return <UserProfile name="John" age={20} />
}
```

```tsx [React]
// UserProfile.tsx
export default function UserProfile(props: { name?: string; age?: number }) {
  const { name = "", age } = props

  return (
    <Text>
      My name is {name} and my age is {age}!
    </Text>
  )
}

// App.tsx
import UserProfile from "./UserProfile"

export default function App() {
  return <UserProfile name="John" age={20} />
}
```

```vue [Vue]
<!-- UserProfile.vue -->
<script setup lang="ts">
const { name = "", age } = defineProps<{
  name?: string
  age?: number
}>()
</script>

<template>
  <Text>My name is {{ name }} and my age is {{ age }}!</Text>
</template>

<!-- App.vue -->
<script setup>
import UserProfile from "./UserProfile.vue"
</script>

<template>
  <UserProfile name="John" :age="20" />
</template>
```

```svelte [Svelte]
<!-- UserProfile.svelte -->
<script lang="ts">
  const { name = "", age }: {
    name?: string
    age?: number
  } = $props()
</script>

<Text>My name is { name } and my age is { age }!</Text>

<!-- App.svelte -->
<script>
  import UserProfile from "./UserProfile.svelte"
</script>

<UserProfile name="John" age={20} />
```

:::

### Emit to parent

::: code-group

```tsx [Gnim]
// AnswerButton.tsx
export default function AnswerButton(props: {
  onAnswer: (value: boolean) => void
}) {
  const { onAnswer } = props

  return (
    <Box>
      <Button onClick={() => onAnswer(true)}>Yes</Button>
      <Button onClick={() => onAnswer(false)}>No</Button>
    </Box>
  )
}

// App.tsx
import { createState } from "gnim"
import AnswerButton from "./AnswerButton"

export default function App() {
  const [flag, setFlag] = createState(true)

  function onAnswer(value: boolean) {
    setFlag(value)
  }

  return <AnswerButton onAnswer={onAnswer} />
}
```

```tsx [React]
// AnswerButton.tsx
export default function AnswerButton(props: {
  onAnswer: (value: boolean) => void
}) {
  const { onAnswer } = props

  return (
    <Box>
      <Button onClick={() => onAnswer(true)}>Yes</Button>
      <Button onClick={() => onAnswer(false)}>No</Button>
    </Box>
  )
}

// App.tsx
import { useState } from "react"
import AnswerButton from "./AnswerButton"

export default function App() {
  const [flag, setFlag] = useState(true)

  function onAnswer(value: boolean) {
    setFlag(value)
  }

  return <AnswerButton onAnswer={onAnswer} />
}
```

```vue [Vue]
<!-- AnswerButton.vue -->
<script setup lang="ts">
const emit = defineEmits<{
  answer: [value: boolean]
}>()
</script>

<template>
  <Box>
    <Button @click="emit('answer', true)">Yes</Button>
    <Button @click="emit('answer', false)">No</Button>
  </Box>
</template>

<!-- App.vue -->
<script setup lang="ts">
import { ref } from "vue"
import AnswerButton from "./AnswerButton.vue"

let flag = ref(true)

function onAnswer(value: boolean) {
  flag.value = value
}
</script>

<template>
  <AnswerButton @answer="onAnswer" />
</template>
```

```svelte [Svelte]
<!-- AnswerButton.svelte -->
<script lang="ts">
  let { onAnswer }: {
    onAnswer: (value: boolean) => void,
  } = $props()
</script>

<Box>
  <Button onclick={() => onAnswer(true)}>Yes</Button>
  <Button onclick={() => onAnswer(false)}>No</Button>
</Box>

<!-- App.svelte -->
<script lang="ts">
  import AnswerButton from "./AnswerButton.svelte";

  let flag = $state(true);

  function onAnswer(value: boolean) {
    flag = value
  }
</script>

<AnswerButton onAnswer={onAnswer} />
```

:::

### Slot

::: code-group

```tsx [Gnim]
// MyButton.tsx
import { type GnimNode } from "gnim"

export default function MyButton(props: {
  namedSlot: GnimNode
  children: GnimNode
}) {
  return (
    <Button>
      {props.named}
      {props.children}
    </Button>
  )
}

// App.tsx
import MyButton from "./MyButton"

export default function App() {
  return <MyButton named={<Text>Hello</Text>}>World</MyButton>
}
```

```tsx [React]
// MyButton.tsx
import { type ReactNode } from "react"

export default function MyButton(props: {
  named: ReactNode
  children: ReactNode
}) {
  return (
    <Button>
      {props.named}
      {props.children}
    </Button>
  )
}

// App.tsx
import MyButton from "./MyButton"

export default function App() {
  return <MyButton named={<Text>Hello</Text>}>World</MyButton>
}
```

```vue [Vue]
<!-- MyButton.vue -->
<template>
  <Button>
    <slot name="named" />
    <slot />
  </Button>
</template>

<!-- App.vue -->
<script setup>
import MyButton from "./MyButton.vue"
</script>

<template>
  <MyButton>
    <template #named>
      <Text>Hello</Text>
    </template>
    World
  </MyButton>
</template>
```

```svelte [Svelte]
<!-- MyButton.svelte -->
<script lang="ts">
	import { type Snippet } from "svelte"

  let { children, named }: { named: Snippet, children: Snippet } = $props()
</script>

<Button >
  {@render named()}
  {@render children()}
</Button>

<!-- App.svelte -->
<script>
  import MyButton from "./MyButton.svelte"
</script>

<MyButton>
  {#snippet named()}
    <Text>Hello</Text>
  {/snippet}
  World
</MyButton>
```

:::

### Context

::: code-group

```tsx [Gnim]
import { createContext } from "gnim"

const ThemeContext = createContext("light")

function Page() {
  return (
    <ThemeContext value="dark">
      <ThemedButton />
    </ThemeContext>
  )
}

function ThemedButton() {
  const theme = ThemeContext.use()
  return <Button>{theme}</Button>
}
```

```tsx [React]
import { createContext, useContext } from "react"

const ThemeContext = createContext("light")

function Page() {
  return (
    <ThemeContext value="dark">
      <ThemedButton />
    </ThemeContext>
  )
}

function ThemedButton() {
  const theme = useContext(ThemeContext)
  return <Button>{theme}</Button>
}
```

```vue [Vue]
<!-- themeContext.ts -->
<script>
export const themeKey = Symbol("theme")
</script>

<!-- ThemeProvider.vue -->
<script setup lang="ts">
import { themeKey } from "./themeContext"
import { provide } from "vue"
provide(themeKey, "dark")
</script>

<template>
  <slot />
</template>

<!-- ThemedButton.vue -->
<script setup lang="ts">
import { themeKey } from "./themeContext"
import { inject } from "vue"

const theme = inject<string>(themeKey, "light")
</script>

<template>
  <Button>{{ theme }}</Button>
</template>
```

```svelte [Svelte]
<!-- themeContext.ts -->
<script lang="ts">
import { createContext } from 'svelte'
export const [getTheme, setTheme] = createContext<string>()
</script>

<!-- ThemeProvider.svelte -->
<script lang="ts">
  import { setTheme } from "./themeContext"
  let { children } = $props()
  setTheme('dark')
</script>

{@render children?.()}

<!-- ThemedButton.svelte -->
<script lang="ts">
  import { getTheme } from './theme'

  const theme = getTheme()
</script>

<Button>{theme}</Button>
```

:::
