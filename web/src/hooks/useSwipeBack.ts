import { useCallback, useEffect, useRef, useState } from 'react'

const EDGE_ZONE = 20
const SWIPE_THRESHOLD_PX = 100
const SWIPE_THRESHOLD_RATIO = 0.3
const MOBILE_BREAKPOINT = 1024

type SwipeState = {
    active: boolean
    startX: number
    startY: number
    currentX: number
    locked: boolean        // true once we know it's horizontal
    cancelled: boolean     // true if vertical scroll won
}

export function useSwipeBack(onBack: () => void) {
    const containerRef = useRef<HTMLDivElement>(null)
    const stateRef = useRef<SwipeState>({
        active: false,
        startX: 0,
        startY: 0,
        currentX: 0,
        locked: false,
        cancelled: false,
    })
    const [offset, setOffset] = useState(0)

    const reset = useCallback(() => {
        stateRef.current = {
            active: false,
            startX: 0,
            startY: 0,
            currentX: 0,
            locked: false,
            cancelled: false,
        }
        setOffset(0)
    }, [])

    useEffect(() => {
        const el = containerRef.current
        if (!el) return

        function onTouchStart(e: TouchEvent) {
            if (window.innerWidth >= MOBILE_BREAKPOINT) return
            const touch = e.touches[0]
            if (touch.clientX > EDGE_ZONE) return

            stateRef.current = {
                active: true,
                startX: touch.clientX,
                startY: touch.clientY,
                currentX: touch.clientX,
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

            // Decide direction once we have enough movement
            if (!s.locked) {
                if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
                    // vertical scroll wins
                    s.cancelled = true
                    setOffset(0)
                    return
                }
                if (Math.abs(dx) > 10) {
                    s.locked = true
                }
            }

            if (!s.locked) return

            // Only allow rightward swipe
            const clamped = Math.max(0, dx)
            s.currentX = touch.clientX
            setOffset(clamped)
        }

        function onTouchEnd() {
            const s = stateRef.current
            if (!s.active || s.cancelled) {
                reset()
                return
            }

            const dx = s.currentX - s.startX
            const threshold = Math.min(SWIPE_THRESHOLD_PX, window.innerWidth * SWIPE_THRESHOLD_RATIO)

            if (s.locked && dx >= threshold) {
                // Trigger back navigation
                reset()
                onBack()
            } else {
                reset()
            }
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
    }, [onBack, reset])

    // Progress 0-1 for visual indicator
    const threshold = Math.min(SWIPE_THRESHOLD_PX, (typeof window !== 'undefined' ? window.innerWidth : 400) * SWIPE_THRESHOLD_RATIO)
    const progress = Math.min(1, offset / threshold)

    return { containerRef, offset, progress }
}
