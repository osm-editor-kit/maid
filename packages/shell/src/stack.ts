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

interface StackActions {
  /** Sets the stack of a plain click (null when the click found one feature or nothing) */
  set: (stack: Stack | null) => void
  /**
   * Drops the stack, if there is one: the map moved or changed mode, a drag began, or the menu that
   * showed the stack closed. Without a stack it changes nothing, so it can run on every map frame.
   */
  drop: () => void
  /**
   * Called on every selection change: a stack goes unless the new selection is one of its features.
   * Plain clicks, Shift, the sidebar, undo and the menu all come through here, so the stack only
   * survives a change that it made itself.
   */
  dropUnless: (selection: readonly string[]) => void
}

/**
 * The one stack is in this file. Components read it through `useStack`; the functions below change it through the
 * store's actions.
 */
const useStackStore = create<{ stack: Stack | null; actions: StackActions }>()((set, get) => ({
  stack: null,
  actions: {
    set: (stack) => set({ stack }),
    drop: () => {
      if (get().stack) set({ stack: null })
    },
    dropUnless: (selection) => {
      const { stack } = get()
      if (stack && !keepsStack(stack, selection)) set({ stack: null })
    },
  },
}))

/** The stack of the last plain click, or null */
export function useStack() {
  return useStackStore((state) => state.stack)
}

/** Sets the stack of a plain click (null when the click found one feature or nothing) */
export function setStack(stack: Stack | null) {
  useStackStore.getState().actions.set(stack)
}

/**
 * Drops the stack, if there is one: the map moved or changed mode, a drag began, or the menu that
 * showed the stack closed. Without a stack it changes nothing, so it can run on every map frame.
 */
export function dropStack() {
  useStackStore.getState().actions.drop()
}

/**
 * Called on every selection change: a stack goes unless the new selection is one of its features.
 * Plain clicks, Shift, the sidebar, undo and the menu all come through here, so the stack only
 * survives a change that it made itself.
 */
export function dropStackUnless(selection: readonly string[]) {
  useStackStore.getState().actions.dropUnless(selection)
}

/** The current stack, read outside React (for the keys) */
export function currentStack() {
  return useStackStore.getState().stack
}
