import { useCallback, useEffect, useRef } from 'react'

const EDGE_GUARD = 24
const SWIPE_THRESHOLD_PX = 80
const SWIPE_THRESHOLD_RATIO = 0.22
const VERTICAL_LOCK_PX = 12
const MOBILE_BREAKPOINT = 1024

type SwipeState = {
    active: boolean
    startX: number
    startY: number
    lastX: number
    locked: boolean
    cancelled: boolean
}

// Bail out when the touch starts on a horizontally-scrolling surface
// (code blocks, terminals, file trees) so swipes inside them don't
// accidentally switch tabs.
function isInsideScrollableHorizontal(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    let el: Element | null = target
    while (el && el !== document.documentElement) {
        if (el instanceof HTMLElement) {
            if (el.dataset.noSwipe !== undefined) return true
            if (el.closest('.terminal-container, [data-terminal], pre, .code-block, .xterm-screen')) {
                return true
            }
            if (el.scrollWidth > el.clientWidth + 1) {
                const overflowX = window.getComputedStyle(el).overflowX
                if (overflowX === 'auto' || overflowX === 'scroll') {
                    return true
                }
            }
        }
        el = el.parentElement
    }
    return false
}

export function useTabSwipe(opts: {
    onSwipeLeft?: () => void   // finger moves leftward (next tab)
    onSwipeRight?: () => void  // finger moves rightward (previous tab)
}) {
    const containerRef = useRef<HTMLDivElement>(null)
    const stateRef = useRef<SwipeState>({
        active: false,
        startX: 0,
        startY: 0,
        lastX: 0,
        locked: false,
        cancelled: false,
    })

    const reset = useCallback(() => {
        stateRef.current = {
            active: false,
            startX: 0,
            startY: 0,
            lastX: 0,
            locked: false,
            cancelled: false,
        }
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        function onTouchStart(e: TouchEvent) {
            if (window.innerWidth >= MOBILE_BREAKPOINT) return
            if (e.touches.length !== 1) return
            const touch = e.touches[0]
            // Leave the left edge to swipe-back.
            if (touch.clientX < EDGE_GUARD) return
            if (isInsideScrollableHorizontal(e.target)) return

            stateRef.current = {
                active: true,
                startX: touch.clientX,
                startY: touch.clientY,
                lastX: touch.clientX,
                locked: false,
                cancelled: false,
            }
        }

        function onTouchMove(e: TouchEvent) {
            const s = stateRef.current
            if (!s.active || s.cancelled) return

            const touch = e.touches[0]
            const dx = touch.clientX - s.startX
            const dy = touch.clientY - s.startY

            if (!s.locked) {
                if (Math.abs(dy) > VERTICAL_LOCK_PX && Math.abs(dy) > Math.abs(dx)) {
                    s.cancelled = true
                    return
                }
                if (Math.abs(dx) > 10) {
                    s.locked = true
                }
            }

            s.lastX = touch.clientX
        }

        function onTouchEnd() {
            const s = stateRef.current
            if (!s.active || s.cancelled || !s.locked) {
                reset()
                return
            }

            const dx = s.lastX - s.startX
            const threshold = Math.min(SWIPE_THRESHOLD_PX, window.innerWidth * SWIPE_THRESHOLD_RATIO)

            if (dx <= -threshold) {
                reset()
                opts.onSwipeLeft?.()
                return
            }
            if (dx >= threshold) {
                reset()
                opts.onSwipeRight?.()
                return
            }
            reset()
        }

        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchmove', onTouchMove, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        el.addEventListener('touchcancel', reset, { passive: true })

        return () => {
            el.removeEventListener('touchstart', onTouchStart)
            el.removeEventListener('touchmove', onTouchMove)
            el.removeEventListener('touchend', onTouchEnd)
            el.removeEventListener('touchcancel', reset)
        }
    }, [opts, reset])

    return { containerRef }
}
