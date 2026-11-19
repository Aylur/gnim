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

const renderQueue: Array<{ run: Fn }> = []
const userQueue: Array<{ run: Fn }> = []
const annotatedErrors = new WeakSet<Error>()

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
    ++batchDepth
    while (renderQueue.length > 0 || userQueue.length > 0) {
        try {
            const job = renderQueue.shift() ?? userQueue.shift()
            job!.run()
        } catch (e) {
            if (!threw) {
                threw = true
                error = e
            }
        }
    }
    --batchDepth
    if (threw) throw error
}

export function batch<T>(fn: () => T): T {
    ++batchDepth
    try {
        return fn()
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
    name?: string
    source?: string
    children?: Scope[]
    cleanups?: Fn[]
    context?: Map<object, unknown> | null
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
    if (scope.disposed) throw Error("scope is disposed")
    return batch(() => {
        const prevScope = setActiveScope(scope)
        try {
            return fn()
        } catch (e) {
            cancelMounts(scope)
            annotateError(e, scope)
            throw e
        } finally {
            activeScope = prevScope
            if (scope.disposed) resetScope(scope)
        }
    })
}

class MountJob {
    owner = activeScope
    fn: Fn

    constructor(fn: Fn) {
        this.fn = fn
    }

    run(): void {
        const owner = this.owner
        if (owner?.disposed) return
        const prevScope = setActiveScope(owner)
        try {
            untrack(this.fn)
        } catch (e) {
            annotateError(e, owner)
            throw e
        } finally {
            activeScope = prevScope
        }
    }
}

function cancelMounts(scope: Scope): void {
    for (let i = userQueue.length - 1; i >= 0; i--) {
        const job = userQueue[i]
        if (!(job instanceof MountJob)) continue

        for (const s of ancestors(job.owner)) {
            if (s === scope) {
                userQueue.splice(i, 1)
                continue
            }
        }
    }
}

function runAllInScope<T>(scope: Scope, items: T[], fn: (item: T) => void, reverse: boolean) {
    try {
        runAll(items, fn, reverse)
    } catch (e) {
        annotateError(e, scope)
        throw e
    }
}

function resetScope(scope: Scope): void {
    const children = scope.children
    const cleanups = scope.cleanups
    scope.children = []
    scope.cleanups = []
    try {
        if (children) runAll(children, disposeChildScope, true)
    } finally {
        if (cleanups) runAllInScope(scope, cleanups, untrack, true)
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

export function createScope(props?: { parent?: Scope | null; name?: string }): Scope {
    const scope: Scope = {
        parent: typeof props?.parent === "undefined" ? activeScope : props.parent,
        name: props?.name,
        dispose: () => disposeScope(scope),
    }

    attachScope(scope)
    return scope
}

export function getScope(): Scope | null {
    return activeScope
}

function* ancestors(scope: Scope | null) {
    for (let s = scope; s; s = s.parent) yield s
}

function annotateError(error: unknown, scope: Scope | null): void {
    if (!(error instanceof Error) || annotatedErrors.has(error)) return

    const stack = Array.from(ancestors(scope))
        .filter((s) => s.name)
        .map((s) => `    in ${s.name}${s.source ? ` (at ${s.source})` : ""}`)

    if (stack.length === 0) return

    annotatedErrors.add(error)
    try {
        Object.assign(error, { scopeStack: stack.join("\n") })
        error.message += `\n${stack.join("\n")}`
    } catch {
        // frozen or otherwise non writable error
    }
}

export function withScopeStack<Args extends Array<any>, R>(
    fn: (...args: Args) => R,
): (...args: Args) => R {
    const scope = activeScope
    if (!scope) return fn
    return (...args) => {
        try {
            return fn(...args)
        } catch (e) {
            annotateError(e, scope)
            throw e
        }
    }
}

export function onCleanup(fn: Fn): void {
    if (!activeScope) throw Error("onCleanup called outside of a scope")
    activeScope.cleanups ??= []
    activeScope.cleanups.push(fn)
}

export function onMount(fn: Fn): void {
    const job = new MountJob(fn)
    if (batchDepth > 0) userQueue.push(job)
    else job.run()
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
    parent: Scope | null
    children: Scope[] = []
    cleanups: Fn[] = []
    context: Map<object, unknown> | null = null
    disposed = false

    value!: T
    getter: (prev?: T) => T
    isEqual: Equals<T>
    error: unknown

    constructor(
        getter: (prev?: T) => T,
        isEqual: Equals<NoInfer<T>> = Object.is,
        parent: Scope | null = activeScope,
    ) {
        super(MUTABLE | DIRTY | UNSET)
        this.getter = getter
        this.isEqual = isEqual
        this.parent = parent
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
            if (this.disposed) {
                // disposed by its own getter: drop deps read after the dispose
                this.unlinkAllDeps()
                this.flags = MUTABLE | (this.flags & ERROR)
            }
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
    context: Map<object, unknown> | null = null
    disposed = false

    value?: T
    fn: (prev?: T) => T
    queue: "user" | "render"

    /**
     * @param queue user effects re-run after every render effect of the flush
     */
    constructor(queue: "user" | "render", fn: (prev?: T) => T) {
        super(WATCHING)
        this.fn = fn
        this.queue = queue
        attachScope(this)
    }

    notify(): void {
        if (!(this.flags & QUEUED)) {
            this.flags |= QUEUED
            if (this.queue === "user") userQueue.push(this)
            else renderQueue.push(this)
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
            if (this.disposed) {
                // disposed by its own fn: drop deps read after the dispose
                this.unlinkAllDeps()
                this.flags = NONE
            }
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
