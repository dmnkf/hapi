export type FocusQueueState = {
    active: boolean
    ids: string[]
    currentIndex: number
}

type Listener = (state: FocusQueueState) => void

let state: FocusQueueState = {
    active: false,
    ids: [],
    currentIndex: 0,
}

const listeners = new Set<Listener>()

function emit(): void {
    for (const l of listeners) l(state)
}

function setState(next: FocusQueueState): void {
    state = next
    emit()
}

export function getFocusQueue(): FocusQueueState {
    return state
}

export function subscribeFocusQueue(listener: Listener): () => void {
    listeners.add(listener)
    return () => {
        listeners.delete(listener)
    }
}

export function enterFocusQueue(ids: string[]): string | null {
    const unique: string[] = []
    const seen = new Set<string>()
    for (const id of ids) {
        if (!seen.has(id)) {
            seen.add(id)
            unique.push(id)
        }
    }
    if (unique.length === 0) {
        setState({ active: false, ids: [], currentIndex: 0 })
        return null
    }
    setState({ active: true, ids: unique, currentIndex: 0 })
    return unique[0]
}

export function advanceFocusQueue(fromSessionId?: string): string | null {
    if (!state.active) return null
    const pivot = fromSessionId ?? state.ids[state.currentIndex]
    const pivotIndex = pivot ? state.ids.indexOf(pivot) : state.currentIndex
    const nextIndex = (pivotIndex >= 0 ? pivotIndex : state.currentIndex) + 1
    if (nextIndex >= state.ids.length) {
        setState({ active: false, ids: [], currentIndex: 0 })
        return null
    }
    setState({ ...state, currentIndex: nextIndex })
    return state.ids[nextIndex]
}

export function exitFocusQueue(): void {
    if (!state.active && state.ids.length === 0) return
    setState({ active: false, ids: [], currentIndex: 0 })
}

export function syncFocusIndexToSession(sessionId: string): void {
    if (!state.active) return
    const idx = state.ids.indexOf(sessionId)
    if (idx >= 0 && idx !== state.currentIndex) {
        setState({ ...state, currentIndex: idx })
    }
}
