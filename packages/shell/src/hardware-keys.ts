/**
 * Is a hardware keyboard there? A web page cannot ask: `(any-pointer: fine)` tells a trackpad or a mouse, not a
 * keyboard, and an iPad with a Smart Keyboard Folio has no pointer at all. Native iPad apps learn it from the system
 * (GCKeyboard, UIKeyCommand); a page learns it only from the first key that only a hardware keyboard sends. Until then a touch device shows no key chips (`nokeys:hidden`, styles.css): a chip that names ⇧ is
 * no help without a ⇧ to press, and the toggles and taps work without it.
 *
 * The attribute `data-keys` on <html> says a keyboard is there: set at once on a device with a fine pointer (input
 * `keyboard`, packages/i18n/src/device.ts), and on a touch device at its first hardware key. It stays for the visit:
 * a keyboard that is taken off again cannot be told apart from one that is not used.
 */

/** What a key press tells: the parts of a `KeyboardEvent` read here, and whether a text field had the focus */
export type KeyPress = {
  key: string
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing?: boolean
  /** The focus is in a text field, where the on-screen keyboard types too */
  typing: boolean
}

/** Keys that are only on a hardware keyboard: the on-screen keyboards of iOS and Android send none of them */
const HARDWARE_ONLY = new Set([
  'Shift',
  'Alt',
  'Control',
  'Meta',
  'CapsLock',
  'Escape',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Delete',
])

/**
 * True when the press came from a hardware keyboard. Outside a text field the on-screen keyboard is closed, so any key
 * is the hardware's. In a field the on-screen keyboard types letters and Backspace, and an Android one sends
 * `Unidentified` while it composes; only a modifier, a function key or a hardware-only key is the hardware's there.
 */
export function isHardwareKey(press: KeyPress): boolean {
  if (press.isComposing || press.key === 'Unidentified' || press.key === 'Process') return false
  if (!press.typing) return true
  if (press.altKey || press.ctrlKey || press.metaKey) return true
  return HARDWARE_ONLY.has(press.key) || /^F\d{1,2}$/.test(press.key)
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  )
}

/**
 * Sets `data-keys` on <html> now when `keyboard` (a fine pointer), else at the first hardware key press. Returns the
 * function that stops listening.
 */
export function watchHardwareKeys(keyboard: boolean, root = document.documentElement) {
  if (keyboard) {
    root.dataset.keys = ''
    return () => {}
  }
  const onKey = (event: KeyboardEvent) => {
    if (!isHardwareKey({ ...pick(event), typing: isTyping(event.target) })) return
    root.dataset.keys = ''
    window.removeEventListener('keydown', onKey, true)
  }
  window.addEventListener('keydown', onKey, true)
  return () => window.removeEventListener('keydown', onKey, true)
}

function pick(event: KeyboardEvent) {
  const { key, shiftKey, altKey, ctrlKey, metaKey, isComposing } = event
  return { key, shiftKey, altKey, ctrlKey, metaKey, isComposing }
}
