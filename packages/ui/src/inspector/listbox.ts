import { moveActive } from './picker-logic.ts'

/**
 * The building blocks that the preset picker and the "Add field" flyout share: the search field
 * that controls a listbox, the highlighted row, the note for an empty list, the keys that move the
 * highlight, and the rule that keeps the focus in the search field. Plain class strings and pure
 * functions, so both look and act alike.
 */

const FRAME =
  'h-10 w-full min-w-0 rounded-lg border border-zinc-950/10 bg-white text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'

/** The search field of a listbox: a 40 px frame, with the placeholder colour */
export const SEARCH_FIELD = `${FRAME} px-3 placeholder:text-zinc-400 dark:placeholder:text-zinc-500`

/**
 * The one row behaviour of every list (type picker, favourites, search results, pickers, menus). The
 * background belongs to the whole row, trailing buttons (star, number, ...) included: put these on the
 * row's outer element and keep the buttons inside its padding as separate click targets.
 * - current: the value in use (blue background; a list without such a value has none)
 * - hover: a lighter grey background
 * - active: the option the keys are on (`aria-activedescendant`): the hover background and an inset ring
 * Use `listRow({ current, active })` so a current and an active row never carry two backgrounds.
 */
export const ROW_BASE = 'rounded-lg'
export const ROW_HOVER = 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
export const ROW_CURRENT =
  'bg-blue-600/15 hover:bg-blue-600/20 dark:bg-blue-400/20 dark:hover:bg-blue-400/25'
const RING = 'ring-2 ring-inset ring-blue-500'
export const ROW_ACTIVE = `bg-zinc-950/5 dark:bg-white/10 ${RING}`

/** The key-focus look of a row that is a real button or menu item (focus moves, no aria-activedescendant) */
export const ROW_FOCUS =
  'focus:bg-zinc-950/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:bg-white/10'

/** The classes of a row's outer element for its state */
export function listRow(state: { current?: boolean; active?: boolean }): string {
  if (state.current) return `${ROW_BASE} ${ROW_CURRENT} ${state.active ? RING : ''}`
  return `${ROW_BASE} ${ROW_HOVER} ${state.active ? ROW_ACTIVE : ''}`
}

/** The one muted line that stands in for a list when nothing matches */
export const EMPTY_NOTE = 'px-2 py-3 text-center text-sm text-zinc-500 dark:text-zinc-400'

/** Keeps the keyboard focus in the search field when a button or a row is pressed */
export const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault()

/** Scrolls a row into view. The row is rendered already, so its element exists. */
export function revealRow(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'nearest' })
}

/**
 * The row that a navigation key moves the highlight to: Down and Up step through the rows (wrapping
 * at both ends), Home and End go to the first and the last. Undefined for any other key. -1 when
 * there are no rows.
 */
export function listboxMove(key: string, active: number, count: number): number | undefined {
  switch (key) {
    case 'ArrowDown':
      return moveActive(active, 1, count)
    case 'ArrowUp':
      return moveActive(active, -1, count)
    case 'Home':
      return count > 0 ? 0 : -1
    case 'End':
      return count - 1
    default:
      return undefined
  }
}
