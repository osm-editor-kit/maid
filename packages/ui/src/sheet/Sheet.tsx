import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent as ReactClipboardEvent,
  type FocusEvent as ReactFocusEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { UI_SPRING } from '../motion.tsx'
import { counterText, rangeEdges } from './cell-look.ts'
import { planPositionalPaste, serializeTsv } from './clipboard.ts'
import { newRowIds } from './ids.ts'
import { actionForKey } from './keys.ts'
import { takeFallback } from './paste-path.ts'
import {
  clearSelection,
  commitEdit,
  initialSheetState,
  selectedCells,
  selectionRect,
  sheetReducer,
  shapeOf,
} from './reducer.ts'
import { SheetCell } from './SheetCell.tsx'
import { SheetStatus } from './SheetStatus.tsx'
import type {
  CellRef,
  ColId,
  EndThen,
  PasteReport,
  RowId,
  SheetCellData,
  SheetClipboard,
  SheetProps,
  SheetRow,
  SheetShape,
  SheetState,
} from './types.ts'

/** Mac: Cmd is the command key. Read once, in the browser. */
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform)

/** The row handle at the left, a narrow column. */
const HANDLE_WIDTH = '0.5rem'

/** How long a message without a refusal stays. */
const MESSAGE_MS = 6000

type PlanInput = Parameters<SheetClipboard['plan']>[0]
type Track = {
  kind: string
  cell?: CellRef
  rowAnchor?: RowId
  wasActive: boolean
  shift: boolean
  moved: boolean
  last?: CellRef
  lastRow?: RowId
}
type StatusInfo = { text: string; refused: PasteReport['refused'] }

function cellText(cell: SheetCellData | undefined): string {
  return cell?.value.kind === 'value' ? cell.value.text : ''
}

/** Without a clipboard prop: tab-separated text, one value per cell. */
function defaultSerialize(rows: readonly SheetRow[], cols: readonly ColId[]): string {
  return serializeTsv(rows.map((row) => cols.map((col) => cellText(row.cells[col]))))
}

function defaultDescribePaste(report: PasteReport): string {
  const text = `${report.added} added, ${report.replaced} replaced`
  return report.refused.length > 0 ? `${text}, ${report.refused.length} refused` : text
}

function sameIds(a: readonly RowId[], b: readonly RowId[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function sameCell(a: CellRef | null | undefined, b: CellRef | null | undefined): boolean {
  return (
    a !== null &&
    a !== undefined &&
    b !== null &&
    b !== undefined &&
    a.row === b.row &&
    a.col === b.col
  )
}

function cellRefOf(element: Element): CellRef | undefined {
  if (!(element instanceof HTMLElement)) return undefined
  const row = element.dataset.row
  const col = element.dataset.col
  return row === undefined || col === undefined ? undefined : { row, col }
}

/** The input of a cell in the grid. */
function cellInput(grid: HTMLElement | null, cell: CellRef): HTMLInputElement | null {
  const selector = `[data-row="${CSS.escape(cell.row)}"][data-col="${CSS.escape(cell.col)}"] input`
  return grid?.querySelector<HTMLInputElement>(selector) ?? null
}

/** The input that is writable: the one in an open edit. */
function openInput(grid: HTMLElement | null): HTMLInputElement | null {
  return grid?.querySelector<HTMLInputElement>('input:not([readonly])') ?? null
}

/**
 * The grid of rows and cells, with the ARIA grid roles, one tab stop (roving focus) and the focus, selection and
 * edit mode of sheetReducer. Every cell is an input: see sheet/SheetCell.tsx and docs/research/sheet-design.md.
 * The sheet owns no data: a change is a SheetBatch for the host.
 */
export function Sheet(props: SheetProps) {
  const {
    label,
    columns,
    rows,
    onChange,
    clipboard,
    trailingRow = false,
    showHeader = false,
    rowActions,
    onUndo,
    onRedo,
    describePaste,
    orderToken = '',
    note,
  } = props
  const editable = onChange !== undefined
  const reduced = useReducedMotion() === true
  const [state, setState] = useState<SheetState>(initialSheetState)
  const showTrailing = trailingRow && editable
  const shape: SheetShape = shapeOf(rows, columns, {
    trailingId: showTrailing ? state.trailingId : undefined,
    sheetReadOnly: !editable,
  })
  const [seenIds, setSeenIds] = useState<RowId[]>(shape.rowIds)
  const [mintRowId] = useState(newRowIds)
  const [status, setStatus] = useState<StatusInfo>()
  const [draftNote, setDraftNote] = useState<string>()
  const [seenNote, setSeenNote] = useState(note)
  const grid = useRef<HTMLDivElement>(null)
  const pendingFocus = useRef<CellRef | null>(null)
  const track = useRef<Track | undefined>(undefined)
  const pasteCount = useRef(0)
  const pasteWait = useRef<number | null>(null)

  const blankRow = useMemo<SheetRow>(
    () => ({ id: state.trailingId, label: 'new row', cells: {} }),
    [state.trailingId],
  )
  const all: SheetRow[] = showTrailing ? [...rows, blankRow] : rows
  const at = state.active
  const rect = selectionRect(state, shape)
  // A single cell is only the active cell (its ring); the fill is for a range of two or more cells
  const ranged = rect !== undefined && (rect.r0 !== rect.r1 || rect.c0 !== rect.c1)
  const tabStop: CellRef | undefined =
    at ??
    (all[0] !== undefined && columns[0] !== undefined
      ? { row: all[0].id, col: columns[0].id }
      : undefined)
  const columnsStyle = {
    gridTemplateColumns: [
      HANDLE_WIDTH,
      ...columns.map((column) => column.width),
      ...(rowActions ? ['auto'] : []),
    ].join(' '),
  }
  const activeText = at === null ? undefined : all.find((row) => row.id === at.row)?.cells[at.col]
  const committedCounter =
    at !== null && state.mode === 'navigate' ? counterText(cellText(activeText)) : undefined
  const counter = state.mode === 'edit' ? draftNote : committedCounter

  // A host that re-sorted or changed the rows: the active cell follows its row id, else keeps its place.
  if (!sameIds(seenIds, shape.rowIds)) {
    setSeenIds(shape.rowIds)
    setState((prev) => sheetReducer(prev, { type: 'rowsChanged', previousRowIds: seenIds }, shape))
  }
  // A new note from the host shows at once.
  if (note !== seenNote) {
    setSeenNote(note)
    setStatus(note === undefined ? undefined : { text: note.text, refused: [] })
  }

  // The focus moves after the render that shows the new active cell (a new row has no input before it).
  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    cellInput(grid.current, target)?.focus({ preventScroll: true })
  })

  // A message without a refusal goes after a while; one with refused lines stays until closed.
  useEffect(() => {
    if (status === undefined || status.refused.length > 0) return
    const timer = window.setTimeout(() => setStatus(undefined), MESSAGE_MS)
    return () => window.clearTimeout(timer)
  }, [status])

  function moveTo(next: SheetState): void {
    setState(next)
    pendingFocus.current = next.active
  }

  /** Ends an edit with the draft (the input's value): one batch, and the state as `after` says. */
  function leaveEdit(input: HTMLInputElement, after: EndThen, from: SheetState): SheetState {
    input.readOnly = true
    const result = commitEdit(from, shape, rows, columns, input.value, after)
    if (result.batch !== undefined && onChange !== undefined) onChange(result.batch)
    if (result.refused !== undefined) setStatus({ text: result.refused, refused: [] })
    setDraftNote(undefined)
    if (result.focus !== undefined) pendingFocus.current = result.focus
    return result.state
  }

  /** Opens the active cell for typing: the input becomes writable now, so the key's own input goes in. */
  function beginEdit(input: HTMLInputElement, how: 'replace' | 'keep'): void {
    const active = state.active
    if (active === null || state.mode === 'edit' || shape.readOnly(active)) return
    input.readOnly = false
    if (how === 'replace') {
      input.select()
      setDraftNote(undefined)
    } else {
      const end = input.value.length
      input.setSelectionRange(end, end)
      setDraftNote(counterText(input.value))
    }
    setState(sheetReducer(state, { type: 'startEdit', how }, shape))
  }

  /** The selected rows and columns, in the order shown; the trailing row is never part of a copy. */
  function selectionSlice(): { rows: SheetRow[]; cols: ColId[] } | undefined {
    const range = selectionRect(state, shape)
    if (range === undefined) return undefined
    const byId = new Map(all.map((row): [RowId, SheetRow] => [row.id, row]))
    const picked = shape.rowIds
      .slice(range.r0, range.r1 + 1)
      .filter((id) => id !== state.trailingId)
      .map((id) => byId.get(id))
      .filter((row): row is SheetRow => row !== undefined)
    return { rows: picked, cols: shape.colIds.slice(range.c0, range.c1 + 1) }
  }

  function selectionText(): string {
    const slice = selectionSlice()
    if (slice === undefined) return ''
    return (clipboard?.serialize ?? defaultSerialize)(slice.rows, slice.cols)
  }

  function writeClipboard(text: string): void {
    void navigator.clipboard.writeText(text).then(
      () => setStatus({ text: 'Copied', refused: [] }),
      () => setStatus({ text: 'The browser did not allow the copy', refused: [] }),
    )
  }

  /** Clears the selection as one batch; with `cut`, it is the cut's batch. */
  function clearSelectionAs(cause: 'delete' | 'cut'): void {
    const batch = clearSelection(state, shape, rows, columns)
    if (batch !== undefined && onChange !== undefined) onChange({ ...batch, cause })
  }

  // The plan of a positional paste (a block of cells onto cells or a range), when the host gives no clipboard.
  function positionalPlan(input: PlanInput): ReturnType<SheetClipboard['plan']> {
    return planPositionalPaste(
      {
        rows: input.rows,
        columns: input.columns,
        trailingId: showTrailing ? state.trailingId : undefined,
        newRowId: input.newRowId,
      },
      input.anchor,
      { text: input.text, selection: input.selection },
    )
  }

  /**
   * Runs a paste. Returns false when the plan leaves it to the browser (an open edit, plain text): the caller then
   * does nothing. The paste is one batch; an open edit is dropped, not committed.
   */
  function pasteText(text: string, editing: boolean, input: HTMLInputElement | null): boolean {
    const anchor = state.active
    if (anchor === null) return false
    if (!editable) return true
    const selection = selectedCells(state, shape).filter((cell) => cell.row !== state.trailingId)
    const plan = clipboard?.plan ?? positionalPlan
    const out = plan({ text, rows, columns, anchor, selection, editing, newRowId: mintRowId })
    if (out === 'native') return false
    let next = state
    if (editing) {
      if (input !== null) input.readOnly = true
      next = sheetReducer(state, { type: 'endEdit', after: 'stay' }, shape)
      setDraftNote(undefined)
    }
    if (out.changes.length > 0 && onChange !== undefined) {
      onChange({ cause: 'paste', changes: out.changes })
    }
    setStatus({
      text: (describePaste ?? defaultDescribePaste)(out.report),
      refused: out.report.refused,
    })
    setState(next)
    pendingFocus.current = out.focus ?? next.active
    return true
  }

  /**
   * Cmd/Ctrl+V in navigation mode: the paste event normally comes first and takes the token. If none came, the
   * clipboard is read here, a moment later, once.
   */
  function armPasteFallback(): void {
    if (!editable) return
    pasteCount.current += 1
    const token = pasteCount.current
    pasteWait.current = token
    window.setTimeout(() => {
      const taken = takeFallback(pasteWait.current, token)
      pasteWait.current = taken.pending
      if (!taken.take) return
      void navigator.clipboard.readText().then(
        (text) => {
          pasteText(text, false, null)
        },
        () => setStatus({ text: 'The browser did not allow reading the clipboard', refused: [] }),
      )
    }, 0)
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || input.closest('[data-col]') === null) return
    const result = actionForKey(
      {
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        isComposing: event.nativeEvent.isComposing,
      },
      state,
      shape,
      { mac: MAC },
    )
    switch (result.kind) {
      case 'native':
        return
      case 'action':
        if (result.prevent) event.preventDefault()
        if (result.action.type === 'startEdit') {
          beginEdit(input, result.action.how)
          return
        }
        moveTo(sheetReducer(state, result.action, shape))
        return
      case 'commit':
        if (result.prevent) event.preventDefault()
        moveTo(leaveEdit(input, result.after, state))
        return
      case 'arrow':
        event.preventDefault()
        moveTo(leaveEdit(input, result.dy > 0 ? 'arrowDown' : 'arrowUp', state))
        return
      case 'cancel':
        // The draft goes with the edit: the cell shows its committed text again.
        event.stopPropagation()
        input.readOnly = true
        setDraftNote(undefined)
        setState(sheetReducer(state, { type: 'endEdit', after: 'stay' }, shape))
        return
      case 'clear':
        event.preventDefault()
        clearSelectionAs('delete')
        return
      case 'clipboard':
        if (result.op === 'copy') {
          event.preventDefault()
          writeClipboard(selectionText())
        } else if (result.op === 'cut') {
          event.preventDefault()
          writeClipboard(selectionText())
          clearSelectionAs('cut')
        } else {
          armPasteFallback()
        }
        return
      case 'undo':
        event.preventDefault()
        onUndo?.()
        return
      case 'redo':
        event.preventDefault()
        onRedo?.()
        return
    }
  }

  function onPaste(event: ReactClipboardEvent<HTMLDivElement>): void {
    const input = event.target
    if (!(input instanceof HTMLInputElement)) return
    pasteWait.current = null
    const editing = state.mode === 'edit'
    const text = event.clipboardData.getData('text/plain')
    if (!pasteText(text, editing, editing ? input : null)) return
    event.preventDefault()
  }

  function onCopy(event: ReactClipboardEvent<HTMLDivElement>): void {
    if (state.mode === 'edit' || at === null) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', selectionText())
  }

  function onCut(event: ReactClipboardEvent<HTMLDivElement>): void {
    if (state.mode === 'edit' || at === null || !editable) return
    event.preventDefault()
    event.clipboardData.setData('text/plain', selectionText())
    clearSelectionAs('cut')
  }

  /** Follows the pointer while it is down: a range of cells, or of rows from a row handle. */
  function listen(): void {
    const move = (event: PointerEvent) => {
      const current = track.current
      const hit = document.elementFromPoint(event.clientX, event.clientY)
      if (current === undefined || !(hit instanceof Element) || !grid.current?.contains(hit)) return
      if (current.rowAnchor !== undefined) {
        const rowId = hit.closest<HTMLElement>('[data-row]')?.dataset.row
        if (rowId === undefined || rowId === current.lastRow) return
        const from = current.rowAnchor
        current.lastRow = rowId
        current.moved = true
        setState((prev) => sheetReducer(prev, { type: 'selectRows', from, to: rowId }, shape))
        return
      }
      const cell = hit.closest<HTMLElement>('[data-col]')
      const ref = cell === null ? undefined : cellRefOf(cell)
      if (ref === undefined || sameCell(ref, current.last)) return
      current.last = ref
      current.moved = true
      setState((prev) => sheetReducer(prev, { type: 'activate', cell: ref, extend: true }, shape))
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !(event.target instanceof Element)) return
    const target = event.target
    const open = openInput(grid.current)
    // The caret of an open edit is the input's own
    if (open !== null && open === target) return
    let base = state
    if (open !== null) base = leaveEdit(open, 'stay', state)
    const mouse = event.pointerType === 'mouse'
    const handle = target.closest<HTMLElement>('[data-row-handle]')
    if (handle !== null) {
      const rowId = handle.closest<HTMLElement>('[data-row]')?.dataset.row
      if (rowId === undefined) return
      event.preventDefault()
      const from = event.shiftKey && base.active !== null ? base.active.row : rowId
      track.current = {
        kind: event.pointerType,
        wasActive: false,
        shift: event.shiftKey,
        moved: false,
        rowAnchor: from,
        lastRow: rowId,
      }
      setState(sheetReducer(base, { type: 'selectRows', from, to: rowId }, shape))
      listen()
      return
    }
    const cellElement = target.closest<HTMLElement>('[data-col]')
    const cell = cellElement === null ? undefined : cellRefOf(cellElement)
    if (cell === undefined) {
      if (open !== null) setState(base)
      return
    }
    // A mouse keeps the focus where the grid puts it: the press does not start a text selection.
    if (mouse) {
      event.preventDefault()
      cellInput(grid.current, cell)?.focus({ preventScroll: true })
    }
    track.current = {
      kind: event.pointerType,
      cell,
      last: cell,
      wasActive: sameCell(base.active, cell) && base.mode === 'navigate',
      shift: event.shiftKey,
      moved: false,
    }
    setState(sheetReducer(base, { type: 'activate', cell, extend: event.shiftKey }, shape))
    listen()
  }

  /** A click on the active cell edits it; a tap (touch, pen) edits at once. */
  function onClick(): void {
    const current = track.current
    track.current = undefined
    if (current === undefined || current.moved || current.shift || current.cell === undefined)
      return
    if (current.kind === 'mouse' && !current.wasActive) return
    const input = cellInput(grid.current, current.cell)
    if (input === null) return
    input.focus({ preventScroll: true })
    beginEdit(input, 'keep')
  }

  function onFocus(event: ReactFocusEvent<HTMLDivElement>): void {
    if (state.active !== null) return
    const target = event.target
    const cell =
      target instanceof HTMLElement ? cellRefOf(target.closest('[data-col]') ?? target) : undefined
    if (cell !== undefined) setState(sheetReducer(state, { type: 'activate', cell }, shape))
  }

  function onBlur(event: ReactFocusEvent<HTMLDivElement>): void {
    const next = event.relatedTarget
    const leaving = !(next instanceof Node) || grid.current?.contains(next) !== true
    let base = state
    const input = event.target
    if (input instanceof HTMLInputElement && !input.readOnly) base = leaveEdit(input, 'stay', state)
    if (leaving) base = sheetReducer(base, { type: 'collapse' }, shape)
    if (base !== state) setState(base)
  }

  function onInput(event: FormEvent<HTMLDivElement>): void {
    const input = event.target
    if (!(input instanceof HTMLInputElement) || state.mode !== 'edit') return
    setDraftNote(counterText(input.value))
  }

  const trailingIndex = showTrailing ? rows.length : -1

  return (
    <div className="flex flex-col">
      <div
        ref={grid}
        role="grid"
        aria-label={label}
        aria-rowcount={all.length + 1}
        aria-colcount={columns.length}
        aria-multiselectable="true"
        aria-readonly={editable ? undefined : true}
        className="border-t border-zinc-950/10 select-none dark:border-white/10"
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onClick={onClick}
        onFocus={onFocus}
        onBlur={onBlur}
        onInput={onInput}
        onPaste={onPaste}
        onCopy={onCopy}
        onCut={onCut}
      >
        <div
          role="row"
          aria-rowindex={1}
          className={showHeader ? 'grid' : 'sr-only'}
          style={columnsStyle}
        >
          <div
            aria-hidden="true"
            className="border-r border-b border-zinc-950/10 dark:border-white/10"
          />
          {columns.map((column) => (
            <div
              key={column.id}
              role="columnheader"
              className="flex h-6 min-w-0 items-center border-r border-b border-zinc-950/10 px-2 text-xs font-medium text-zinc-500 dark:border-white/10 dark:text-zinc-400"
            >
              {column.header}
            </div>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {all.map((row, r) => {
            const isTrailing = r === trailingIndex
            const inRange = rect !== undefined && r >= rect.r0 && r <= rect.r1
            const motionProps = reduced
              ? {}
              : {
                  initial: { opacity: 0, height: 0 },
                  animate: { opacity: 1, height: 'auto' },
                  exit: { opacity: 0, height: 0 },
                }
            return (
              <motion.div
                key={row.id}
                role="row"
                aria-rowindex={r + 2}
                data-row={row.id}
                className="grid items-stretch overflow-hidden"
                style={columnsStyle}
                layout={reduced ? false : 'position'}
                layoutDependency={orderToken}
                transition={UI_SPRING}
                {...motionProps}
              >
                <div
                  aria-hidden="true"
                  data-row-handle="true"
                  className={`border-r border-b border-zinc-950/10 dark:border-white/10 ${
                    inRange && state.rowsSelected
                      ? 'bg-blue-500'
                      : 'hover:bg-zinc-950/5 dark:hover:bg-white/10'
                  }`}
                />
                {columns.map((column, c) => {
                  const ref = { row: row.id, col: column.id }
                  const active = sameCell(at, ref)
                  const selected =
                    ranged && rect !== undefined && inRange && c >= rect.c0 && c <= rect.c1
                  return (
                    <SheetCell
                      key={column.id}
                      row={row}
                      column={column}
                      data={row.cells[column.id]}
                      trailing={isTrailing}
                      active={active}
                      editing={active && state.mode === 'edit'}
                      selected={selected}
                      edges={selected && rect !== undefined ? rangeEdges(r, c, rect) : 0}
                      readOnly={shape.readOnly(ref)}
                      tabIndex={sameCell(tabStop, ref) ? 0 : -1}
                    />
                  )
                })}
                {rowActions !== undefined && !isTrailing ? (
                  <div role="gridcell" className="flex items-center gap-0.5 px-1">
                    {rowActions(row)}
                  </div>
                ) : null}
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      <SheetStatus
        message={status?.text}
        counter={counter}
        refused={status?.refused ?? []}
        onClose={status === undefined ? undefined : () => setStatus(undefined)}
      />
    </div>
  )
}
