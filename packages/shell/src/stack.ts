import { create } from 'zustand'

/**
 * The features at one clicked place, in the order a click lists them. The first one is what the
 * click selected; the others are reached with the pill on the map, its list, or `,` and `.`.
 */
export type Stack = { lon: number; lat: number; ids: string[] }

/** The next (1) or the previous (-1) feature of the stack, from the current one; wraps round the ends */
export function stepStackId(ids: readonly string[], current: string, step: 1 | -1) {
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
export function keepsStack(stack: Stack, selection: readonly string[]) {
  return selection.length === 1 && stack.ids.includes(selection[0]!)
}

/** The one stack is in this file. Components read it through `useStack`, and the functions below change it. */
const useStackStore = create<{ stack: Stack | null }>()(() => ({ stack: null }))

/** The stack of the last plain click, or null */
export function useStack() {
  return useStackStore((state) => state.stack)
}

function setHeld(stack: Stack | null) {
  useStackStore.setState({ stack })
}

/** Sets the stack of a plain click (null when the click found one feature or nothing) */
export function setStack(stack: Stack | null) {
  setHeld(stack)
}

/**
 * Drops the stack, if there is one: the map moved or changed mode, a drag began, or the menu that
 * showed the stack closed. Without a stack it changes nothing, so it can run on every map frame.
 */
export function dropStack() {
  if (useStackStore.getState().stack) setHeld(null)
}

/**
 * Called on every selection change: a stack goes unless the new selection is one of its features.
 * Plain clicks, Shift, the sidebar, undo and the menu all come through here, so the stack only
 * survives a change that it made itself.
 */
export function dropStackUnless(selection: readonly string[]) {
  const { stack } = useStackStore.getState()
  if (stack && !keepsStack(stack, selection)) setHeld(null)
}

/** The current stack, read outside React (for the keys) */
export function currentStack() {
  return useStackStore.getState().stack
}
