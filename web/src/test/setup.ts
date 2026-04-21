import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom's localStorage is broken in some Bun/Node versions (missing clear,
// getItem, etc.).  Provide a full in-memory implementation so every test
// that touches localStorage works reliably.
const storageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => (key in store ? store[key] : null),
        setItem: (key: string, value: string) => {
            store[key] = String(value)
        },
        removeItem: (key: string) => {
            delete store[key]
        },
        clear: () => {
            store = {}
        },
        get length() {
            return Object.keys(store).length
        },
        key: (index: number) => Object.keys(store)[index] ?? null,
    }
})()

afterEach(() => {
    storageMock.clear()
    if (typeof document !== 'undefined') {
        cleanup()
    }
})

Object.defineProperty(globalThis, 'localStorage', { value: storageMock, writable: true })
if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'localStorage', { value: storageMock, writable: true })
}
