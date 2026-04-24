import { useSyncExternalStore } from 'react'
import { getFocusQueue, subscribeFocusQueue, type FocusQueueState } from '@/lib/focusQueue'

export function useFocusQueue(): FocusQueueState {
    return useSyncExternalStore(subscribeFocusQueue, getFocusQueue, getFocusQueue)
}
