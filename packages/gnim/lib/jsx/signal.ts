import {
    checkDirty,
    DIRTY,
    link,
    type Link,
    MUTABLE,
    type Node,
    NONE,
    PENDING,
    propagate,
    RECURSED_CHECK,
    shallowPropagate,
    unlink,
    WATCHING,
} from "./graph.js"

// Low-level reactive graph nodes and scope bookkeeping. The public API in
// reactive.ts wraps these; the graph algorithm itself lives in graph.ts.

export type Fn = () => void
export type Equals<T> = (a: T, b: T) => boolean

let cycle = 0
let batchDepth = 0
let runDepth = 0
let activeSub: Node | null = null
let activeScope: Scope | null = null

const QUEUED = 64
const UNSET = 128
const ERROR = 256

const queue: Array<{ run: Fn }> = []

function runAll<T>(items: T[], fn: (item: T) => void, reverse: boolean): void {
    let threw = false
    let error: unknown
    const n = items.length
    for (let i = 0; i < n; i++) {
        try {
            fn(items[reverse ? n - 1 - i : i])
        } catch (e) {
            if (!threw) {
                threw = true
                error = e
            }
        }
    }
    if (threw) throw error
}

function setActiveSub(sub: Node | null) {
    const prevSub = activeSub
    activeSub = sub
    return prevSub
}

function setActiveScope(scope: Scope | null) {
    const prevScope = activeScope
    activeScope = scope
    return prevScope
}

function flush() {
    let threw = false
    let error: unknown
    while (queue.length > 0) {
        try {
            queue.shift()!.run()
        } catch (e) {
            if (!threw) {
                threw = true
                error = e
            }
        }
    }
    if (threw) throw error
}

export function batch(fn: Fn) {
    ++batchDepth
    try {
        fn()
    } finally {
        if (--batchDepth === 0) {
            flush()
        }
    }
}

export function untrack<Args extends Array<any>, T>(fn: (...args: Args) => T, ...args: Args): T {
    const prevSub = setActiveSub(null)
    try {
        return fn(...args)
    } finally {
        activeSub = prevSub
    }
}

export interface Scope {
    parent: Scope | null
    children?: Scope[]
    cleanups?: Fn[]
    mounts?: Fn[]
    context?: Map<object, unknown> | null
    mounted?: boolean
    disposed?: boolean

    dispose(): void
}

export interface Context<T> {
    defaultValue: T
}

function attachScope(scope: Scope): void {
    if (scope.parent) {
        scope.parent.children ??= []
        scope.parent.children.push(scope)
    }
}

export function runScope<T>(scope: Scope, fn: () => T): T {
    if (scope.disposed) throw new Error("scope is disposed")
    const prevScope = setActiveScope(scope)
    let result: T
    try {
        result = fn()
        flushMounts(scope)
    } catch (e) {
        scope.mounts = []
        throw e
    } finally {
        activeScope = prevScope
    }
    return result
}

function flushMounts(scope: Scope): void {
    if (scope.mounted) return
    scope.mounted = true
    const mounts = scope.mounts
    scope.mounts = []
    if (mounts) {
        runAll(mounts, untrack, false)
    }
}

function resetScope(scope: Scope): void {
    const children = scope.children
    const cleanups = scope.cleanups
    scope.children = []
    scope.cleanups = []
    scope.mounts = []
    scope.mounted = false
    try {
        if (children) runAll(children, disposeChildScope, true)
    } finally {
        if (cleanups) runAll(cleanups, untrack, true)
    }
}

function disposeChildScope(scope: Scope): void {
    scope.dispose()
}

function disposeScope(scope: Scope): boolean {
    if (scope.disposed) return false
    scope.disposed = true
    try {
        resetScope(scope)
    } finally {
        if (scope.parent && scope.parent.children) {
            const siblings = scope.parent.children
            const i = siblings.indexOf(scope)
            if (i !== -1) siblings.splice(i, 1)
        }
    }
    return true
}

export function createScope(parent = activeScope): Scope {
    const scope: Scope = {
        parent,
        dispose: () => disposeScope(scope),
    }

    attachScope(scope)
    return scope
}

export function getScope(): Scope | null {
    return activeScope
}

export function onCleanup(fn: Fn): void {
    if (!activeScope) throw new Error("onCleanup called outside of a scope")
    activeScope.cleanups ??= []
    activeScope.cleanups.push(fn)
}

export function onMount(fn: Fn): void {
    if (!activeScope) throw new Error("onMount called outside of a scope")
    if (!activeScope.mounted) {
        activeScope.mounts ??= []
        activeScope.mounts.push(fn)
    }
}

export function setContext<T>(ctx: Context<T>, value: T): void {
    if (!activeScope) throw Error("setContext called outside of a scope")
    const map = (activeScope.context ??= new Map())
    map.set(ctx, value)
}

export function getContext<T>(ctx: Context<T>): T {
    let s = activeScope
    if (!s) throw Error("getContext called outside of a scope")
    while (s) {
        if (s.context?.has(ctx)) return s.context.get(ctx) as T
        s = s.parent
    }
    return ctx.defaultValue
}

abstract class ReactiveNode implements Node {
    deps: Link | null = null
    depsTail: Link | null = null
    subs: Link | null = null
    subsTail: Link | null = null
    flags: number

    constructor(flags: number) {
        this.flags = flags
    }

    protected shouldUpdate() {
        if (this.flags & DIRTY) {
            return true
        }
        if (this.flags & PENDING) {
            if (checkDirty(this.deps!, this)) {
                return true
            }
            this.flags &= ~PENDING
        }
        return false
    }

    protected purgeDeps(): void {
        let toRemove = this.depsTail ? (this.depsTail as Link).nextDep : this.deps
        while (toRemove) toRemove = unlink(toRemove, this)
    }

    protected unlinkAllDeps(): void {
        let dep = this.deps
        while (dep) dep = unlink(dep, this)
    }
}

export class Signal<T> extends ReactiveNode {
    value: T
    pendingValue: T
    isEqual: Equals<T>

    constructor(value: T, isEqual: Equals<NoInfer<T>> = Object.is) {
        super(MUTABLE)
        this.pendingValue = this.value = value
        this.isEqual = isEqual
    }

    update() {
        this.flags = MUTABLE
        const prev = this.value
        return !this.isEqual(prev, (this.value = this.pendingValue))
    }

    get(): T {
        if (this.shouldUpdate() && this.update()) {
            const subs = this.subs
            if (subs) shallowPropagate(subs)
        }
        if (activeSub) {
            link(this, activeSub, cycle)
        }
        return this.value
    }

    set(value: T) {
        this.pendingValue = value
        this.flags = MUTABLE | DIRTY
        const subs = this.subs
        if (subs) {
            propagate(subs, runDepth > 0)
            if (batchDepth === 0) {
                flush()
            }
        }
    }
}

export class External<T> extends ReactiveNode {
    value!: T
    getter: (prev?: T) => T
    subscriber: (notify: Fn) => Fn
    unsubscribe: Fn | null = null
    isEqual: Equals<T>
    error: unknown

    constructor(
        get: (prev?: T) => T,
        subscribe: (notify: Fn) => Fn,
        isEqual: Equals<NoInfer<T>> = Object.is,
    ) {
        super(MUTABLE | DIRTY | UNSET)
        this.getter = get
        this.subscriber = subscribe
        this.isEqual = isEqual
    }

    update(): boolean {
        const flags = this.flags
        this.flags = MUTABLE
        const prev = this.value
        try {
            const next = (this.value = untrack(this.getter, prev))
            return (flags & (UNSET | ERROR)) !== NONE || !this.isEqual(prev, next)
        } catch (error) {
            this.error = error
            this.flags |= ERROR
            return true
        }
    }

    notify(): void {
        this.flags |= DIRTY
        const subs = this.subs
        if (subs) {
            propagate(subs, runDepth > 0)
            if (batchDepth === 0) {
                flush()
            }
        }
    }

    get(): T {
        if (activeSub && !this.unsubscribe) {
            this.unsubscribe = this.subscriber(() => this.notify())
            this.flags |= DIRTY
        }
        if (!this.unsubscribe) {
            return untrack(this.getter, this.value)
        }
        if (this.shouldUpdate() && this.update()) {
            const subs = this.subs
            if (subs) shallowPropagate(subs)
        }
        if (activeSub) {
            link(this, activeSub, cycle)
        }
        if (this.flags & ERROR) throw this.error
        return this.value
    }

    unwatched(): void {
        const unsubscribe = this.unsubscribe
        this.unsubscribe = null
        this.flags |= DIRTY
        unsubscribe?.()
    }
}

export class Computed<T> extends ReactiveNode implements Scope {
    parent: Scope | null = activeScope
    children: Scope[] = []
    cleanups: Fn[] = []
    mounts: Fn[] = []
    context: Map<object, unknown> | null = null
    mounted = false
    disposed = false

    value!: T
    getter: (prev?: T) => T
    isEqual: Equals<T>
    error: unknown

    constructor(getter: (prev?: T) => T, isEqual: Equals<NoInfer<T>> = Object.is) {
        super(MUTABLE | DIRTY | UNSET)
        this.getter = getter
        this.isEqual = isEqual
        attachScope(this)
    }

    get(): T {
        if (!this.disposed && this.shouldUpdate() && this.update()) {
            const subs = this.subs
            if (subs) shallowPropagate(subs)
        }
        if (activeSub) {
            link(this, activeSub, cycle)
        }
        if (this.flags & ERROR) throw this.error
        return this.value
    }

    update(): boolean {
        const flags = this.flags
        this.flags = MUTABLE
        try {
            resetScope(this)
        } catch (error) {
            return this.fail(error)
        }
        if (this.disposed) return false
        ++cycle
        this.depsTail = null
        this.flags = MUTABLE | RECURSED_CHECK
        const prevSub = setActiveSub(this)
        try {
            return runScope(this, () => {
                const prev = this.value
                const next = (this.value = this.getter(prev))
                return (flags & (UNSET | ERROR)) !== NONE || !this.isEqual(prev, next)
            })
        } catch (error) {
            return this.fail(error)
        } finally {
            activeSub = prevSub
            this.flags &= ~RECURSED_CHECK
            this.purgeDeps()
        }
    }

    fail(error: unknown): true {
        this.error = error
        this.flags |= ERROR
        return true
    }

    unwatched(): void {
        if (this.disposed) return
        resetScope(this)
        this.unlinkAllDeps()
        this.flags = MUTABLE | DIRTY
    }

    dispose(): void {
        if (this.disposed) return
        try {
            disposeScope(this)
        } finally {
            this.unlinkAllDeps()
            this.flags = MUTABLE | (this.flags & ERROR)
        }
    }
}

export class Effect<T> extends ReactiveNode implements Scope {
    parent: Scope | null = activeScope
    children: Scope[] = []
    cleanups: Fn[] = []
    mounts: Fn[] = []
    context: Map<object, unknown> | null = null
    mounted = false
    disposed = false

    value?: T
    fn: (prev?: T) => T

    constructor(fn: (prev?: T) => T) {
        super(WATCHING)
        this.fn = fn
        attachScope(this)
    }

    notify(): void {
        if (!(this.flags & QUEUED)) {
            this.flags |= QUEUED
            queue.push(this)
        }
    }

    run() {
        this.flags &= ~QUEUED
        if (this.disposed) return
        if (this.deps && !this.shouldUpdate()) {
            return
        }

        // Clean before cleanups run: if one throws, this run is skipped but the
        // effect stays subscribed through its existing deps.
        this.flags = WATCHING
        resetScope(this)
        if (this.disposed) return
        ++cycle
        this.depsTail = null
        this.flags = WATCHING | RECURSED_CHECK
        const prevSub = setActiveSub(this)
        ++runDepth
        try {
            runScope(this, () => {
                this.value = this.fn(this.value)
            })
        } finally {
            --runDepth
            activeSub = prevSub
            this.flags &= ~RECURSED_CHECK
            this.purgeDeps()
        }
    }

    dispose(): void {
        if (this.disposed) return
        try {
            disposeScope(this)
        } finally {
            this.unlinkAllDeps()
            this.flags = NONE
        }
    }
}
