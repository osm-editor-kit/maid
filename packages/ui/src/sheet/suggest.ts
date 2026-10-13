/**
 * Suggestions in the sheet, as logic (no DOM, no React). A cell's suggestion source gets one run at a time:
 * a new run aborts the last one, and an answer that arrives for a run that is no longer current is dropped
 * (docs/research/sheet-design.md, "Suggestions"). Keys while the list is open are `suggestAction`: arrows move
 * the highlight, Enter and Tab take the highlighted item, Escape closes the list and keeps the cell in edit mode.
 */

export type SuggestRun = {
  readonly signal: AbortSignal
  /** False once a newer run started, the run was cancelled, or its signal was aborted. */
  isCurrent(): boolean
}

export type SuggestRuns = {
  /** Starts a run and aborts the previous one. */
  start(): SuggestRun
  /** Aborts the current run (the cell stopped editing, or was unmounted). */
  cancel(): void
}

export function createSuggestRuns(): SuggestRuns {
  let current: AbortController | undefined
  return {
    start() {
      current?.abort()
      const own = new AbortController()
      current = own
      return {
        signal: own.signal,
        isCurrent: () => current === own && !own.signal.aborted,
      }
    },
    cancel() {
      current?.abort()
      current = undefined
    },
  }
}

/** What a key does while the list is open. */
export type SuggestAction = 'next' | 'previous' | 'take' | 'close'

export type SuggestState = {
  /** The list is shown: there are items and the person has not closed it for this text. */
  open: boolean
  count: number
  /** The highlighted item, -1 for none (the typed text). */
  highlighted: number
}

/**
 * The action of a key while the list is open, or undefined when the key is the cell's own (the list is
 * closed, or no item is highlighted for Enter and Tab: a quiet list does not take an item by itself).
 */
export function suggestAction(key: string, state: SuggestState): SuggestAction | undefined {
  if (!state.open || state.count <= 0) return undefined
  switch (key) {
    case 'ArrowDown':
      return 'next'
    case 'ArrowUp':
      return 'previous'
    case 'Enter':
    case 'Tab':
      return state.highlighted >= 0 ? 'take' : undefined
    case 'Escape':
      return 'close'
    default:
      return undefined
  }
}

/**
 * The highlight after an arrow. From no highlight, Down goes to the first item and Up to the last; past either
 * end it wraps (as the combobox in inspector/fields/ComboInput.tsx does, `moveActive`).
 */
export function stepHighlight(current: number, delta: 1 | -1, count: number): number {
  if (count <= 0) return -1
  const from = current >= 0 && current < count ? current : delta > 0 ? -1 : count
  return (((from + delta) % count) + count) % count
}
