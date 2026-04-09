/**
 * View Transitions API helper.
 *
 * Wraps a DOM-mutating callback in `document.startViewTransition()` when the
 * browser supports it.  Falls back to calling the callback directly otherwise.
 *
 * The optional `direction` parameter adds a CSS class (`vt-back`) to the
 * `<html>` element so keyframe rules in index.css can reverse the slide
 * direction for back-navigation.
 */
export function startViewTransition(
    callback: () => void,
    direction: 'forward' | 'back' = 'forward',
): void {
    if (!document.startViewTransition) {
        callback()
        return
    }

    if (direction === 'back') {
        document.documentElement.classList.add('vt-back')
    }

    const transition = document.startViewTransition(callback)

    transition.finished.then(() => {
        document.documentElement.classList.remove('vt-back')
    }).catch(() => {
        document.documentElement.classList.remove('vt-back')
    })
}
