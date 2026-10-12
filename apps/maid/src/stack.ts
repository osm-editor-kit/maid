import { useSyncExternalStore } from 'react'

/**
 * The features at one clicked place, in the order a click lists them. The first one is what the
 * click selected; the others are reached with the pill on the map, its list, or `,` and `.`.
 */
export type Stack = { lon: number; lat: number; ids: string[] }

/** The next (1) or the previous (-1) feature of the stack, from the current one; wraps round the ends */
export function stepStackId(
  ids: readonly string[],
  current: string,
  step: 1 | -1,
): string | undefined {
  if (ids.length === 0) return undefined
  const index = ids.indexOf(current)
  // a feature that is not in the stack: the next one is the first, the previous one the last
  if (index < 0) return step > 0 ? ids[0] : ids[ids.length - 1]
  return ids[(index + step + ids.length) % ids.length]
}

/**
 * True if a selection keeps the stack: exactly one feature of it is selected. Any other selection
 * (nothing, several features, a feature that is not in the stack) drops the stack.
 */
export function keepsStack(stack: Stack, selection: readonly string[]): boolean {
  return selection.length === 1 && stack.ids.includes(selection[0]!)
}

/** The one stack, in an object so that it is not a reassigned variable; `listeners` are React's */
const holder: { stack: Stack | null } = { stack: null }
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The stack of the last plain click, or null */
export function useStack(): Stack | null {
  return useSyncExternalStore(subscribe, () => holder.stack)
}

function setHeld(stack: Stack | null) {
  holder.stack = stack
  for (const listener of listeners) listener()
}

/** Sets the stack of a plain click (null when the click found one feature or nothing) */
export function setStack(stack: Stack | null) {
  setHeld(stack)
}

/**
 * Called on every selection change: a stack goes unless the new selection is one of its features.
 * Plain clicks, Shift, the sidebar, undo and the menu all come through here, so the stack only
 * survives a change that it made itself.
 */
export function dropStackUnless(selection: readonly string[]) {
  const { stack } = holder
  if (stack && !keepsStack(stack, selection)) setHeld(null)
}

/** The current stack, read outside React (for the keys) */
export function currentStack(): Stack | null {
  return holder.stack
}
