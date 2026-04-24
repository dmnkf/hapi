import { afterEach, describe, expect, it } from 'vitest'
import {
    advanceFocusQueue,
    enterFocusQueue,
    exitFocusQueue,
    getFocusQueue,
    subscribeFocusQueue,
    syncFocusIndexToSession,
} from './focusQueue'

afterEach(() => {
    exitFocusQueue()
})

describe('focusQueue', () => {
    it('enter returns first id and activates the queue', () => {
        const first = enterFocusQueue(['a', 'b', 'c'])
        expect(first).toBe('a')
        expect(getFocusQueue()).toEqual({ active: true, ids: ['a', 'b', 'c'], currentIndex: 0 })
    })

    it('enter with empty list leaves queue inactive', () => {
        const first = enterFocusQueue([])
        expect(first).toBeNull()
        expect(getFocusQueue().active).toBe(false)
    })

    it('enter dedupes input', () => {
        enterFocusQueue(['a', 'b', 'a', 'c', 'b'])
        expect(getFocusQueue().ids).toEqual(['a', 'b', 'c'])
    })

    it('advance returns the next id', () => {
        enterFocusQueue(['a', 'b', 'c'])
        expect(advanceFocusQueue('a')).toBe('b')
        expect(advanceFocusQueue('b')).toBe('c')
    })

    it('advance past the end clears and deactivates', () => {
        enterFocusQueue(['a', 'b'])
        advanceFocusQueue('a')
        expect(advanceFocusQueue('b')).toBeNull()
        expect(getFocusQueue().active).toBe(false)
    })

    it('sync updates the index when navigating to a queue item', () => {
        enterFocusQueue(['a', 'b', 'c'])
        syncFocusIndexToSession('c')
        expect(getFocusQueue().currentIndex).toBe(2)
    })

    it('sync is a no-op for ids outside the queue', () => {
        enterFocusQueue(['a', 'b'])
        syncFocusIndexToSession('z')
        expect(getFocusQueue().currentIndex).toBe(0)
    })

    it('notifies subscribers on state changes', () => {
        const seen: boolean[] = []
        const unsub = subscribeFocusQueue(s => seen.push(s.active))
        enterFocusQueue(['a'])
        advanceFocusQueue('a')
        unsub()
        expect(seen).toEqual([true, false])
    })
})
