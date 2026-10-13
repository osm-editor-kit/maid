/**
 * Contract of the sheet (packages/ui/src/sheet): the public types, the reducer's state and actions.
 * The clipboard and the tags adapter are written against this file; change a name here only with them.
 *
 * Decisions made while writing the contract (where docs/research/sheet-design.md left a signature open):
 *
 * 1. `SheetShape` is the grid as the reducer sees it: `rowIds` in display order, with the trailing row's id
 *    LAST when the sheet has a trailing row (the trailing row is a position; it has no `SheetRow` yet);
 *    `colIds`; and `readOnly(cell)`, which folds row, column, cell and whole-sheet read-only into one answer.
 *    `shapeOf` in reducer.ts builds it.
 * 2. `commitEdit` takes the end-of-edit `after` (default 'stay') and returns the whole next state, not only a
 *    batch: a commit in the trailing row mints the next trailing id, and `nextId` lives in `SheetState`.
 * 3. Ids the sheet mints are `t<n>`, from `nextId`. A host's `newRowId` (paste) must not produce `t<digits>`.
 * 4. `rowsChanged` carries `previousRowIds`: the order before the change, so the active row can be clamped
 *    to the same index. `shape.rowIds` is the order after.
 * 5. `move` has `wrap` (Tab wraps over rows, arrows do not) and `edge` (Cmd/Ctrl+arrows, Home, End).
 * 6. `endEdit` has `arrowDown` / `arrowUp`: commit and move in the ACTIVE cell's column, ignoring a Tab run.
 *    `down` / `up` (Enter, Shift+Enter) use the column the Tab run began in, as the design says.
 * 7. Escape in edit mode is not an action: the host drops the draft and dispatches `endEdit` with 'stay'.
 * 8. `selectAll` sets `rowsSelected` to false: Delete clears the cells, it never removes rows that way.
 * 9. `SheetProps` lives here with a type-only import of `ReactNode`; it is erased at runtime, so this file
 *    still has no React in it.
 * 10. `SheetKeyEvent` and `SheetKeyResult` live in keys.ts (they are the key layer's, not the contract's).
 */
import type { ReactNode } from 'react'

/** Id of a row. Stable for the life of the row: a rename of a tag key keeps it. */
export type RowId = string

/** Id of a column. */
export type ColId = string

/** A cell by its row and column ids (not by index: ids survive a re-sort). */
export type CellRef = { row: RowId; col: ColId }

/**
 * A cell's value. `mixed`: several selected features disagree; an `undefined` text in `values` means the key
 * is absent on those features, and `count` is how many features have that state.
 */
export type CellValue =
  | { kind: 'value'; text: string }
  | { kind: 'mixed'; values: { text: string | undefined; count: number }[] }

/** What the host knows about one cell. The sheet never stores it; the host passes it in every render. */
export type SheetCellData = {
  value: CellValue
  /** The cell cannot be edited, pasted over or cleared. It can still be selected and copied. */
  readOnly?: boolean
  /** A message makes the cell invalid (red, `aria-invalid`). The column's `validate` adds to it. */
  invalid?: string
  /** A fixed set, so every sheet looks alike. */
  tone?: 'default' | 'muted' | 'differs' | 'changed'
}

/** One row of the sheet. The trailing empty row is NOT a `SheetRow`: the sheet has its id and no data. */
export type SheetRow = {
  id: RowId
  /** Used in the cells' accessible names ("Value of highway"). */
  label: string
  /** Missing cell id = the cell is empty. Unchanged rows must return the same cell objects (no re-render). */
  cells: Record<ColId, SheetCellData>
  /** The whole row cannot be edited, pasted over or removed. */
  readOnly?: boolean
}

/** A suggestion for a cell: what is written when it is taken, and how it is shown. */
export type SheetSuggestion = { value: string; label?: string; hint?: string }

/** What a suggestion provider gets: the cell, its row as it is now, and what is typed so far. */
export type SuggestContext = { cell: CellRef; row: SheetRow; text: string }

/**
 * A suggestion provider. Local providers answer at once; a provider that makes a request must honour `signal`
 * (aborted when the text changes) and set `suggestDelay` on the column.
 */
export type Suggest = (
  ctx: SuggestContext,
  signal: AbortSignal,
) => SheetSuggestion[] | Promise<SheetSuggestion[]>

/** One column of the sheet. */
export type SheetColumn = {
  id: ColId
  /** Always in the accessibility tree; `showHeader` on the sheet only hides it visually. */
  header: string
  /** A CSS grid track: '2fr', 'minmax(6rem,1fr)', '8rem'. */
  width: string
  /** The key column of a way table: the row header. */
  role?: 'rowheader'
  /** No cell of this column can be edited (the cells can still be selected and copied). */
  readOnly?: boolean
  mono?: boolean
  /**
   * A text typed here that equals another row's text is refused, and the focus moves to that row
   * (the column after this one, same row). Tags: the key.
   */
  unique?: boolean
  /** Runs on the committed text and on the draft. Returns a message when invalid. Never changes the text. */
  validate?: (text: string, row: SheetRow) => string | undefined
  /** Applied on commit (trim, NFC). Must not shorten: over-long text stays and is invalid. */
  clean?: (text: string) => string
  suggest?: Suggest
  /** Milliseconds before `suggest` runs: 0 for local lists, 300 for anything that makes a request. */
  suggestDelay?: number
}

/**
 * One change to the data. The host turns a batch into its own edit; the sheet never writes data itself.
 * `insert` comes from the trailing row: `row` is the id the new row takes (minted by the sheet).
 */
export type SheetChange =
  | { type: 'set'; row: RowId; col: ColId; text: string }
  | { type: 'clear'; row: RowId; col: ColId }
  | { type: 'insert'; row: RowId; cells: Record<ColId, string> }
  | { type: 'remove'; row: RowId }

/**
 * Everything one gesture changes. One batch per gesture = one undo step in the host.
 * `changes` is never empty: a gesture that changes nothing gives no batch.
 */
export type SheetBatch = {
  cause: 'edit' | 'suggestion' | 'paste' | 'cut' | 'delete' | 'fill'
  changes: SheetChange[]
}

/** What a paste did, for the status line (`describePaste` turns it into text). */
export type PasteReport = {
  added: number
  replaced: number
  unchanged: number
  refused: { line: number; text: string; reason: string }[]
}

/**
 * How the sheet copies and pastes. Positional sheets use the default (tab-separated); the tags use their own plan.
 */
export type SheetClipboard = {
  /** Text for the selected cells, row by row. */
  serialize: (rows: SheetRow[], cols: ColId[]) => string
  /**
   * What a paste does. `'native'` lets the browser paste into the input (edit mode, where the plan says so).
   * `focus` is where the cursor goes afterwards.
   */
  plan: (input: {
    text: string
    rows: SheetRow[]
    columns: SheetColumn[]
    anchor: CellRef
    selection: CellRef[]
    editing: boolean
    newRowId: () => RowId
  }) => { changes: SheetChange[]; report: PasteReport; focus?: CellRef } | 'native'
}

/** Props of the grid. `rows` is controlled; ids are stable for the life of a row. */
export type SheetProps = {
  /** aria-label of the grid. */
  label: string
  columns: SheetColumn[]
  rows: SheetRow[]
  /** Absent: the whole sheet is read-only. */
  onChange?: (batch: SheetBatch) => void
  /** Default: tab-separated, positional. */
  clipboard?: SheetClipboard
  /** An empty row is always last; its first commit is an `insert`. */
  trailingRow?: boolean
  /** Shows the column headers. They are always in the accessibility tree either way. */
  showHeader?: boolean
  /** Buttons at the end of a row (remove, "fill row"), revealed on hover or focus. */
  rowActions?: (row: SheetRow) => ReactNode
  /** Cmd/Ctrl+Z in navigation mode. */
  onUndo?: () => void
  /** Shift+Cmd/Ctrl+Z and Ctrl+Y in navigation mode. */
  onRedo?: () => void
  /** The live message after a paste. Default counts the cells. */
  describePaste?: (report: PasteReport) => string
  /** Changes when the host re-sorted the rows: the only trigger of the layout animation. */
  orderToken?: string
  /** A host message for the status line (e.g. "Copied"). A new object shows again. */
  note?: { text: string }
}

/**
 * The grid as the reducer sees it (built by `shapeOf`). The trailing row, when there is one, is the last id.
 */
export type SheetShape = {
  rowIds: RowId[]
  colIds: ColId[]
  /** True when the cell cannot be edited: its row, its column, the cell, or the whole sheet is read-only. */
  readOnly: (cell: CellRef) => boolean
}

/**
 * Where the focus stands. Never changes on a keystroke: the draft lives in the editing cell.
 * The range is the rectangle `anchor`..`active`, in the rows' current order. `anchor: null` = one cell.
 */
export type SheetState = {
  active: CellRef | null
  anchor: CellRef | null
  /** The range was made with a row handle or Shift+Space: whole rows, which Delete removes. */
  rowsSelected: boolean
  mode: 'navigate' | 'edit'
  /** Typing replaces the text (`replace`); Enter, F2 and a double click keep it, caret at the end (`keep`). */
  editStart: 'replace' | 'keep'
  /** The column where a run of Tabs began: Enter and Shift+Enter return to it on the next row. */
  tabOrigin: ColId | null
  /** Id of the trailing empty row (a position in the shape, not a row of the host). */
  trailingId: RowId
  /** Next number for a minted id (`t<n>`). */
  nextId: number
}

/** Where the focus goes when an edit ends. */
export type EndThen = 'stay' | 'down' | 'up' | 'next' | 'previous' | 'arrowDown' | 'arrowUp'

/** Every change of focus, selection and mode the reducer knows. */
export type SheetAction =
  | { type: 'activate'; cell: CellRef; extend?: boolean }
  | {
      type: 'move'
      dx: -1 | 0 | 1
      dy: -1 | 0 | 1
      extend?: boolean
      edge?: boolean
      wrap?: boolean
    }
  | { type: 'selectRows'; from: RowId; to?: RowId }
  | { type: 'selectAll' }
  | { type: 'collapse' }
  | { type: 'startEdit'; how: 'replace' | 'keep' }
  | { type: 'endEdit'; after: EndThen }
  /** `previousRowIds` is the order before the change; the reducer takes the new order from `shape`. */
  | { type: 'rowsChanged'; previousRowIds: RowId[] }
