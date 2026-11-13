import { describe, expect, it } from "@gnim-js/assert"
import { tee } from "../lib/lib.js"

async function take<T>(iterator: AsyncIterator<T>, count: number): Promise<T[]> {
    const values: T[] = []
    for (let i = 0; i < count; i++) {
        const result = await iterator.next()
        if (result.done) break
        values.push(result.value)
    }
    return values
}

async function all<T>(iterable: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = []
    for await (const value of iterable) values.push(value)
    return values
}

/** A source that records how far it was read and whether it was stopped. */
function source(count: number, failAt = -1) {
    const state = { pulled: 0, stopped: false }
    async function* generate() {
        try {
            for (let i = 0; i < count; i++) {
                if (i === failAt) throw new Error(`failed at ${i}`)
                state.pulled++
                yield i
            }
        } finally {
            state.stopped = true
        }
    }
    return { state, chunks: generate() }
}

describe("tee", () => {
    it("gives both branches every chunk", async () => {
        const [a, b] = tee(source(5).chunks)
        expect(await all(a)).toEqual([0, 1, 2, 3, 4])
        expect(await all(b)).toEqual([0, 1, 2, 3, 4])
    })

    it("reads the source once, when the branches read at a different pace", async () => {
        const { state, chunks } = source(4)
        const [a, b] = tee(chunks)

        expect(await take(a, 3)).toEqual([0, 1, 2])
        expect(state.pulled).toBe(3)
        expect(await take(b, 2)).toEqual([0, 1])
        expect(state.pulled).toBe(3)

        const [restA, restB] = await Promise.all([all(a), all(b)])
        expect(restA).toEqual([3])
        expect(restB).toEqual([2, 3])
        expect(state.pulled).toBe(4)
    })

    it("fails both branches after the chunks before the error", async () => {
        const [a, b] = tee(source(5, 2).chunks)

        const read = async (branch: AsyncIterable<number>) => {
            const values: number[] = []
            try {
                for await (const value of branch) values.push(value)
            } catch (error) {
                return { values, error }
            }
            return { values, error: null }
        }

        const [resultA, resultB] = await Promise.all([read(a), read(b)])
        for (const result of [resultA, resultB]) {
            expect(result.values).toEqual([0, 1])
            expect(result.error).toEqual(new Error("failed at 2"))
        }
    })

    it("keeps reading the source for one branch when the other stops", async () => {
        const { state, chunks } = source(4)
        const [a, b] = tee(chunks)

        for await (const value of a) {
            expect(value).toBe(0)
            break
        }
        expect(state.stopped).toBe(false)
        expect(await all(b)).toEqual([0, 1, 2, 3])
        expect(state.stopped).toBe(true)
    })

    it("stops the source once both branches stopped", async () => {
        const { state, chunks } = source(100)
        const [a, b] = tee(chunks)

        expect(await take(a, 2)).toEqual([0, 1])
        await a.return(null)
        expect(state.stopped).toBe(false)

        expect(await take(b, 1)).toEqual([0])
        await b.return(null)
        expect(state.stopped).toBe(true)
        expect(state.pulled).toBe(2)
    })

    it("drops the chunks buffered for a branch that stopped", async () => {
        const { chunks } = source(3)
        const [a, b] = tee(chunks)

        await b.return(null)
        expect(await all(a)).toEqual([0, 1, 2])
        expect(await all(b)).toEqual([])
    })
})
