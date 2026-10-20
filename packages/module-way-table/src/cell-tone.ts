/**
 * How a cell looks for its state (docs/research/way-table.md, 4.4): the fill and text colour per state, in light and
 * dark mode, and a second cue besides the colour (a mark, a dashed border, or the header's "Selected"). Pure: classes
 * as literal strings, so Tailwind finds them (the module's source is in the shell's @source list).
 */
import type { CellState } from './cell-state.ts'

export type CellTone = {
  /** The fill of the cell's wrapper */
  readonly cell: string
  /** The colour of the value's text */
  readonly text: string
  /** The mark at the top left ('' for none): ≠ different, + added, − missing */
  readonly mark: string
  /** A dashed inset border (missing) */
  readonly dashed: boolean
}

const TONES: Readonly<Record<CellState, CellTone>> = {
  reference: {
    cell: 'bg-blue-50 dark:bg-blue-950/40',
    text: 'text-zinc-950 dark:text-white',
    mark: '',
    dashed: false,
  },
  same: { cell: '', text: 'text-zinc-950 dark:text-white', mark: '', dashed: false },
  different: {
    cell: 'bg-amber-100 dark:bg-amber-950/40',
    text: 'text-amber-900 dark:text-amber-200',
    mark: '≠',
    dashed: false,
  },
  added: {
    cell: 'bg-emerald-100 dark:bg-emerald-950/40',
    text: 'text-emerald-900 dark:text-emerald-200',
    mark: '+',
    dashed: false,
  },
  missing: {
    cell: 'bg-red-50 dark:bg-red-950/30',
    text: 'text-red-800 dark:text-red-300',
    mark: '−',
    dashed: true,
  },
  empty: { cell: '', text: 'text-zinc-400 dark:text-zinc-500', mark: '', dashed: false },
}

export function toneOf(state: CellState): CellTone {
  return TONES[state]
}

/** The header of the reference column: a stronger blue than its cells */
export const REFERENCE_HEADER_CLASS = 'bg-blue-100 dark:bg-blue-900/50'

/** The outline of a cell that a carry or set-on-all would change */
export const PREVIEW_CLASS = 'outline-2 -outline-offset-2 outline-dashed outline-amber-500'

/**
 * The bar at the bottom of a cell changed in this session (against the base data): the yellow of a retagged feature in
 * the map's edits display (G, renderer layers.ts EDIT_COLOUR, iD's visual diff), as a cell edit is a tag change
 */
export const EDITED_BAR_CLASS = 'bg-[#fcde5a]'

/** The legend chips, in the order they are shown */
export const LEGEND_STATES: readonly CellState[] = [
  'reference',
  'different',
  'added',
  'missing',
  'empty',
]
