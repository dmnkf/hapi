import { describe, expect, it, vi, afterEach } from 'vitest'
import { ApiClient, ApiError } from './client'

describe('ApiClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('throws structured API errors for failed JSON endpoints', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => new Response(
            JSON.stringify({ error: 'Subscription not found' }),
            {
                status: 404,
                statusText: 'Not Found',
                headers: { 'content-type': 'application/json' }
            }
        )))

        const api = new ApiClient('token')

        await expect(api.setVisibility({
            subscriptionId: 'stale-subscription',
            visibility: 'visible'
        })).rejects.toMatchObject({
            name: 'ApiError',
            status: 404,
            code: 'Subscription not found'
        } satisfies Partial<ApiError>)
    })
})
