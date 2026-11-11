import { device } from '@osm-editor-kit/maid-i18n'

/**
 * Whether a panel may put the focus into a field by itself, when it opens. With a keyboard that saves a click. On a
 * touch device a focused field without its keyboard looks broken (the ring is there, nothing types), and when the
 * keyboard does come it covers half the screen for a choice that is made by tapping. There only a field where typing
 * is the point takes the focus on its own: a search (the top bar's, the type picker's); everything else waits for
 * the tap. The device is the one the texts use (packages/i18n/src/device.ts).
 */
export function autoFocusFields(): boolean {
  return device().input === 'keyboard'
}

let keyboardLast = false
// on the window in the capture phase, from the start: before any panel's own key handling closes it
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', () => (keyboardLast = true), { capture: true })
  window.addEventListener('pointerdown', () => (keyboardLast = false), { capture: true })
}

/**
 * Whether the last input was a key and not a pointer. A panel that closes gives the focus back to its trigger only
 * then: after a click Safari draws the focus ring on a button it focuses from a script, though the person used the
 * mouse (Tobias, 2026-11-11). With the keyboard the focus has to go back, so the way through the page goes on.
 */
export function lastInputWasKeyboard(): boolean {
  return keyboardLast
}
