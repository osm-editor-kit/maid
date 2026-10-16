/**
 * The modifier keys that drawing and dragging read (ADR 0011, hook 1). The map view sets them from each pointer
 * event, a window listener from each key press, and a blur clears them. The engine keeps the last state
 * (`engine.modifiers`), so a tool reads the keys without an event of its own.
 */
export type Modifiers = { shift: boolean; alt: boolean; ctrl: boolean; meta: boolean }

/** No key held: the state after the window loses focus, and the start */
export const NO_MODIFIERS: Modifiers = { shift: false, alt: false, ctrl: false, meta: false }

/** The keys of an event: a keyboard, mouse or touch event all carry them */
export function modifiersOf(event: {
  shiftKey: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): Modifiers {
  return { shift: event.shiftKey, alt: event.altKey, ctrl: event.ctrlKey, meta: event.metaKey }
}

export function sameModifiers(a: Modifiers, b: Modifiers) {
  return a.shift === b.shift && a.alt === b.alt && a.ctrl === b.ctrl && a.meta === b.meta
}
