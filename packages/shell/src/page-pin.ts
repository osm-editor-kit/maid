/**
 * Keeps the page itself at scroll 0. Maid is one screen tall and never scrolls as a page: only its panels scroll.
 *
 * iOS (Safari, and Chrome and Firefox, which use the same WebKit) scrolls the whole page when the on-screen keyboard
 * opens, so that the focused field stays above it, and often leaves it scrolled when the keyboard closes. The page
 * then sits shifted up by the keyboard's height: the top bar and the sidebar's top are cut off and a white block
 * fills the bottom (Tobias on an iPad in Chrome, 2026-11-12). `overflow: hidden` on the page does not stop this
 * scroll; nothing but a script can undo it.
 *
 * While a field has the focus and the keyboard is open, the page may scroll: that is how iOS keeps the field in view.
 * Once the keyboard is gone (the field lost the focus, or the keyboard's hide key closed it with the focus kept), the
 * page goes back to 0. A pinch zoom is left alone, so a person can still zoom the page (WCAG 1.4.4).
 */

const TEXT_FIELD = 'input, textarea, select, [contenteditable="true"], [contenteditable=""]'

/** A keyboard shrinks the visual viewport by more than this, in CSS px; browser bars and a hardware keyboard's
 *  shortcut row stay below it */
export const KEYBOARD_MIN_PX = 120

export type PageView = {
  scrollX: number
  scrollY: number
  innerHeight: number
  /** the visual viewport's height and scale; missing in a browser without `visualViewport` */
  viewportHeight?: number
  scale?: number
  /** a text field has the focus */
  typing: boolean
}

/** Whether the page is scrolled while it should not be: no keyboard open and no pinch zoom */
export function shouldUnscroll(view: PageView) {
  if (view.scrollX === 0 && view.scrollY === 0) return false
  if ((view.scale ?? 1) > 1.01) return false
  const keyboardOpen =
    view.typing &&
    view.viewportHeight !== undefined &&
    view.innerHeight - view.viewportHeight > KEYBOARD_MIN_PX
  return !keyboardOpen
}

function currentView(): PageView {
  const viewport = window.visualViewport
  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    viewportHeight: viewport?.height,
    scale: viewport?.scale,
    typing: document.activeElement?.matches(TEXT_FIELD) ?? false,
  }
}

/** Starts keeping the page at scroll 0; returns a function that stops it */
export function pinPage() {
  const check = () => {
    if (shouldUnscroll(currentView())) window.scrollTo(0, 0)
  }
  // the keyboard animates out after the focus has moved: check again once it is gone
  let timer: number | undefined
  const checkSoon = () => {
    check()
    window.clearTimeout(timer)
    timer = window.setTimeout(check, 400)
  }
  const viewport = window.visualViewport
  window.addEventListener('scroll', check, { passive: true })
  window.addEventListener('focusout', checkSoon)
  window.addEventListener('orientationchange', checkSoon)
  viewport?.addEventListener('resize', checkSoon)
  viewport?.addEventListener('scroll', check)
  // a page restored from the back-forward cache or a tab brought back may come back scrolled
  const onVisible = () => {
    if (document.visibilityState === 'visible') checkSoon()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('pageshow', checkSoon)
  check()
  return () => {
    window.clearTimeout(timer)
    window.removeEventListener('scroll', check)
    window.removeEventListener('focusout', checkSoon)
    window.removeEventListener('orientationchange', checkSoon)
    viewport?.removeEventListener('resize', checkSoon)
    viewport?.removeEventListener('scroll', check)
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('pageshow', checkSoon)
  }
}
