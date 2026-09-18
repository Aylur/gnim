// adapted from https://github.com/stackblitz/alien-signals

export interface Node {
    deps: Link | null
    depsTail: Link | null
    subs: Link | null
    subsTail: Link | null
    flags: number

    update?(): boolean
    notify?(): void
    unwatched?(): void
}

export interface Link {
    version: number
    dep: Node
    sub: Node
    prevSub: Link | null
    nextSub: Link | null
    prevDep: Link | null
    nextDep: Link | null
}

export interface Stack<T> {
    value: T
    prev: Stack<T> | null
}

export const NONE = 0
export const MUTABLE = 1
export const WATCHING = 2
export const RECURSED_CHECK = 4
export const RECURSED = 8
export const DIRTY = 16
export const PENDING = 32

export function link(dep: Node, sub: Node, version: number): void {
    const prevDep = sub.depsTail
    if (prevDep?.dep === dep) {
        return
    }
    const nextDep = prevDep !== null ? prevDep.nextDep : sub.deps
    if (nextDep?.dep === dep) {
        nextDep.version = version
        sub.depsTail = nextDep
        return
    }
    const prevSub = dep.subsTail
    if (prevSub?.version === version && prevSub?.sub === sub) {
        return
    }
    const newLink =
        (sub.depsTail =
        dep.subsTail =
            {
                version,
                dep,
                sub,
                prevDep,
                nextDep,
                prevSub,
                nextSub: null,
            })
    if (nextDep) {
        nextDep.prevDep = newLink
    }
    if (prevDep) {
        prevDep.nextDep = newLink
    } else {
        sub.deps = newLink
    }
    if (prevSub) {
        prevSub.nextSub = newLink
    } else {
        dep.subs = newLink
    }
}

export function unlink(link: Link, sub = link.sub): Link | null {
    const { dep, prevDep, nextDep, nextSub, prevSub } = link
    if (nextDep) {
        nextDep.prevDep = prevDep
    } else {
        sub.depsTail = prevDep
    }
    if (prevDep) {
        prevDep.nextDep = nextDep
    } else {
        sub.deps = nextDep
    }
    if (nextSub) {
        nextSub.prevSub = prevSub
    } else {
        dep.subsTail = prevSub
    }
    if (prevSub) {
        prevSub.nextSub = nextSub
    } else if ((dep.subs = nextSub) === null) {
        dep.unwatched?.()
    }
    return nextDep
}

function isValidLink(checkLink: Link, sub: Node): boolean {
    let link = sub.depsTail
    while (link) {
        if (link === checkLink) {
            return true
        }
        link = link.prevDep
    }
    return false
}

export function propagate(link: Link, innerWrite: boolean): void {
    let next = link.nextSub
    let stack: Stack<Link | null> | null = null

    top: while (true) {
        const sub = link.sub
        let flags = sub.flags

        if (!(flags & (RECURSED_CHECK | RECURSED | DIRTY | PENDING))) {
            sub.flags = flags | PENDING
            if (innerWrite) {
                sub.flags |= RECURSED
            }
        } else if (!(flags & (RECURSED_CHECK | RECURSED))) {
            flags = NONE
        } else if (!(flags & RECURSED_CHECK)) {
            sub.flags = (flags & ~RECURSED) | PENDING
        } else if (!(flags & (DIRTY | PENDING)) && isValidLink(link, sub)) {
            sub.flags = flags | (RECURSED | PENDING)
            flags &= MUTABLE
        } else {
            flags = NONE
        }

        if (flags & WATCHING) {
            sub.notify?.()
        }

        if (flags & MUTABLE) {
            const subSubs = sub.subs
            if (subSubs) {
                const nextSub = (link = subSubs).nextSub
                if (nextSub) {
                    stack = { value: next, prev: stack }
                    next = nextSub
                }
                continue
            }
        }

        if ((link = next!)) {
            next = link.nextSub
            continue
        }

        while (stack) {
            link = stack.value!
            stack = stack.prev
            if (link) {
                next = link.nextSub
                continue top
            }
        }

        break
    }
}

export function checkDirty(link: Link, sub: Node): boolean {
    let stack: Stack<Link> | null = null
    let checkDepth = 0
    let dirty = false

    top: while (true) {
        const dep = link.dep
        const flags = dep.flags

        if (sub.flags & DIRTY) {
            dirty = true
        } else if ((flags & (MUTABLE | DIRTY)) === (MUTABLE | DIRTY)) {
            const subs = dep.subs!
            if (dep.update?.()) {
                if (subs.nextSub) {
                    shallowPropagate(subs)
                }
                dirty = true
            }
        } else if ((flags & (MUTABLE | PENDING)) === (MUTABLE | PENDING)) {
            stack = { value: link, prev: stack }
            link = dep.deps!
            sub = dep
            ++checkDepth
            continue
        }

        if (!dirty) {
            const nextDep = link.nextDep
            if (nextDep) {
                link = nextDep
                continue
            }
        }

        while (checkDepth--) {
            link = stack!.value
            stack = stack!.prev
            if (dirty) {
                const subs = sub.subs!
                if (sub.update?.()) {
                    if (subs.nextSub) {
                        shallowPropagate(subs)
                    }
                    sub = link.sub
                    continue
                }
                dirty = false
            } else {
                sub.flags &= ~PENDING
            }
            sub = link.sub
            const nextDep = link.nextDep
            if (nextDep) {
                link = nextDep
                continue top
            }
        }

        return dirty && !!sub.flags
    }
}

export function shallowPropagate(link: Link): void {
    do {
        const sub = link.sub
        const flags = sub.flags
        if ((flags & (PENDING | DIRTY)) === PENDING) {
            sub.flags = flags | DIRTY
            if ((flags & (WATCHING | RECURSED_CHECK)) === WATCHING) {
                sub.notify?.()
            }
        }
    } while ((link = link.nextSub!))
}
