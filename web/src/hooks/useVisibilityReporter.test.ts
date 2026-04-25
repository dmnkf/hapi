import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import type { ApiClient } from '@/api/client'
import { useVisibilityReporter } from './useVisibilityReporter'

function createApi(setVisibility: ApiClient['setVisibility']): ApiClient {
    return { setVisibility } as ApiClient
}

async function flushPromises(): Promise<void> {
    await act(async () => {
        await Promise.resolve()
        await Promise.resolve()
    })
}

describe('useVisibilityReporter', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
        vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('requests SSE reconnect when the server no longer knows the subscription', async () => {
        const setVisibility = vi.fn(async () => {
            throw new ApiError(
                'HTTP 404 Not Found: {"error":"Subscription not found"}',
                404,
                'Subscription not found',
                '{"error":"Subscription not found"}'
            )
        }) as ApiClient['setVisibility']
        const onSubscriptionMissing = vi.fn()

        renderHook(() => useVisibilityReporter({
            api: createApi(setVisibility),
            subscriptionId: 'stale-subscription',
            onSubscriptionMissing
        }))

        await flushPromises()

        expect(onSubscriptionMissing).toHaveBeenCalledTimes(1)

        act(() => {
            vi.advanceTimersByTime(2500)
        })

        expect(setVisibility).toHaveBeenCalledTimes(1)
    })

    it('retries transient visibility update failures', async () => {
        const setVisibility = vi.fn()
            .mockRejectedValueOnce(new Error('network hiccup'))
            .mockResolvedValueOnce(undefined) as ApiClient['setVisibility']

        renderHook(() => useVisibilityReporter({
            api: createApi(setVisibility),
            subscriptionId: 'active-subscription'
        }))

        await flushPromises()

        expect(setVisibility).toHaveBeenCalledTimes(1)

        act(() => {
            vi.advanceTimersByTime(2000)
        })

        await flushPromises()

        expect(setVisibility).toHaveBeenCalledTimes(2)
    })
})
