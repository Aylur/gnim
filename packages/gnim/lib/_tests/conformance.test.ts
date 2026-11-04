import {
    setExpect,
    SkipTest,
    testSuite,
    type ReactiveFramework,
} from "reactive-framework-test-suite"
import { describe, expect, it } from "vitest"
import { computed, createRoot, createState, effect, onCleanup, untrack } from "../jsx/reactive.js"
import { batch } from "../jsx/signal.js"

const reactive: ReactiveFramework = {
    name: "reactive",
    signal(initialValue) {
        const [read, write] = createState(initialValue)
        return { read, write }
    },
    computed(fn) {
        const read = computed(fn)
        return { read }
    },
    effect(fn) {
        return createRoot((dispose) => {
            effect(() => {
                const cleanup = fn()
                if (typeof cleanup === "function") onCleanup(cleanup)
            })
            return dispose
        })
    },
    run(fn) {
        createRoot(fn)
    },
    batch(fn) {
        return batch(fn)
    },
    untracked(fn) {
        return untrack(fn)
    },
}

setExpect(expect)

for (const { section, cases } of testSuite) {
    describe(section, () => {
        for (const [name, fn] of Object.entries(cases)) {
            it(name, () => {
                try {
                    reactive.run(() => fn(reactive))
                } catch (e) {
                    if (e instanceof SkipTest) return
                    throw e
                }
            })
        }
    })
}
