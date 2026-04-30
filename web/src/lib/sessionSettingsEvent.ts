// Lightweight cross-component bridge so the SessionHeader status pill can
// open the HappyComposer's settings overlay without prop-drilling state up
// to SessionChat. Both components scope by sessionId.
export const OPEN_SESSION_SETTINGS_EVENT = 'hapi:open-session-settings'

export type OpenSessionSettingsDetail = { sessionId: string }

export function dispatchOpenSessionSettings(sessionId: string): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(
        new CustomEvent<OpenSessionSettingsDetail>(OPEN_SESSION_SETTINGS_EVENT, {
            detail: { sessionId }
        })
    )
}
