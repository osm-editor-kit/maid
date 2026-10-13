import { describe, expect, it } from 'bun:test'
import {
  clearSelection,
  commitEdit,
  initialSheetState,
  selectedCells,
  sheetReducer,
  shapeOf,
} from './reducer.ts'
import type {
  CellRef,
  SheetCellData,
  SheetColumn,
  SheetRow,
  SheetShape,
  SheetState,
} from './types.ts'

const keyColumn: SheetColumn = {
  id: 'key',
  header: 'Key',
  width: '2fr',
  unique: true,
  clean: (text) => text.trim(),
}
const valueColumn: SheetColumn = {
  id: 'value',
  header: 'Value',
  width: '3fr',
  validate: (text) => (text.length > 255 ? 'Too long' : undefined),
}
const columns: SheetColumn[] = [keyColumn, valueColumn]

function text(value: string, extra: Partial<SheetCellData> = {}): SheetCellData {
  return { value: { kind: 'value', text: value }, ...extra }
}

function row(id: string, key: string, value: string, extra: Partial<SheetRow> = {}): SheetRow {
  return { id, label: key, cells: { key: text(key), value: text(value) }, ...extra }
}

const rowA = row('a', 'highway', 'residential')
const rowB = row('b', 'name', 'A')
const rowC = row('c', 'surface', '')
const rows: SheetRow[] = [rowA, rowB, rowC]
// The trailing row (t0) is the last position of the grid; it has no SheetRow.
const shape: SheetShape = shapeOf(rows, columns, { trailingId: 't0' })

const cell = (rowId: string, col: string): CellRef => ({ row: rowId, col })
const focus = (at: CellRef): SheetState => ({ ...initialSheetState(), active: at })
const editing = (at: CellRef): SheetState => ({ ...focus(at), mode: 'edit' })

describe('sheetReducer: activate and move', () => {
  it('activates a cell and drops a range', () => {
    const start: SheetState = { ...focus(cell('a', 'key')), anchor: cell('a', 'key') }
    const next = sheetReducer(start, { type: 'activate', cell: cell('b', 'value') }, shape)
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.anchor).toBeNull()
  })

  it('ignores a cell that is not in the grid', () => {
    const start = focus(cell('a', 'key'))
    expect(sheetReducer(start, { type: 'activate', cell: cell('zz', 'key') }, shape)).toBe(start)
  })

  it('moves one cell, and stays at every edge of the grid', () => {
    let state = focus(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: 0 }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: -1 }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 1 }, shape)
    expect(state.active).toEqual(cell('b', 'value'))
  })

  it('moves into the trailing row, which is the last cell, and never past it', () => {
    let state = focus(cell('c', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1 }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1, extend: true }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
    expect(state.anchor).toEqual(cell('t0', 'value'))
  })

  it('extends a range from the anchor with Shift, and a plain move collapses it', () => {
    let state = focus(cell('a', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 1, extend: true }, shape)
    expect(state.anchor).toEqual(cell('a', 'key'))
    expect(state.active).toEqual(cell('b', 'value'))
    expect(selectedCells(state, shape)).toHaveLength(4)
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1 }, shape)
    expect(state.anchor).toBeNull()
    expect(state.active).toEqual(cell('c', 'value'))
  })

  it('a range that reaches the edge stays inside the grid', () => {
    let state = focus(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: -1, extend: true, edge: true }, shape)
    expect(state.active).toEqual(cell('a', 'key'))
    expect(selectedCells(state, shape).map((c) => c.row)).toEqual(['a', 'b'])
  })

  it('goes to the edge of the row or the column with edge moves', () => {
    let state = focus(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 0, edge: true }, shape)
    expect(state.active).toEqual(cell('b', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: -1, edge: true }, shape)
    expect(state.active).toEqual(cell('a', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 0, dy: 1, edge: true }, shape)
    expect(state.active).toEqual(cell('t0', 'value'))
  })

  it('Tab wraps over the rows, and does nothing at the two ends of the sheet', () => {
    let state = focus(cell('a', 'value'))
    state = sheetReducer(state, { type: 'move', dx: 1, dy: 0, wrap: true }, shape)
    expect(state.active).toEqual(cell('b', 'key'))
    state = sheetReducer(state, { type: 'move', dx: -1, dy: 0, wrap: true }, shape)
    expect(state.active).toEqual(cell('a', 'value'))
    const first = focus(cell('a', 'key'))
    expect(sheetReducer(first, { type: 'move', dx: -1, dy: 0, wrap: true }, shape)).toEqual(first)
    const last = focus(cell('t0', 'value'))
    expect(sheetReducer(last, { type: 'move', dx: 1, dy: 0, wrap: true }, shape)).toEqual(last)
  })

  it('arrows do not wrap over rows', () => {
    const state = focus(cell('a', 'value'))
    expect(sheetReducer(state, { type: 'move', dx: 1, dy: 0 }, shape).active).toEqual(
      cell('a', 'value'),
    )
  })

  it('a move leaves edit mode', () => {
    const next = sheetReducer(editing(cell('a', 'key')), { type: 'move', dx: 0, dy: 1 }, shape)
    expect(next.mode).toBe('navigate')
    expect(next.active).toEqual(cell('b', 'key'))
  })
})

describe('sheetReducer: rows, all and collapse', () => {
  it('selects a run of rows over all columns', () => {
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'selectRows', from: 'b', to: 'c' },
      shape,
    )
    expect(next.rowsSelected).toBe(true)
    expect(next.anchor).toEqual(cell('b', 'key'))
    expect(next.active).toEqual(cell('c', 'value'))
    expect(selectedCells(next, shape).map((c) => c.row)).toEqual(['b', 'b', 'c', 'c'])
  })

  it('selects all rows but not the trailing one', () => {
    const next = sheetReducer(focus(cell('b', 'value')), { type: 'selectAll' }, shape)
    expect(next.anchor).toEqual(cell('a', 'key'))
    expect(next.active).toEqual(cell('c', 'value'))
    expect(next.rowsSelected).toBe(false)
    expect(selectedCells(next, shape).some((c) => c.row === 't0')).toBe(false)
  })

  it('collapses a range to the active cell', () => {
    let state = sheetReducer(focus(cell('a', 'key')), { type: 'selectAll' }, shape)
    state = sheetReducer(state, { type: 'collapse' }, shape)
    expect(state.anchor).toBeNull()
    expect(state.rowsSelected).toBe(false)
    expect(state.active).toEqual(cell('c', 'value'))
  })
})

describe('sheetReducer: edit mode', () => {
  it('starts an edit that keeps the active cell and drops the range', () => {
    const start: SheetState = { ...focus(cell('b', 'value')), anchor: cell('a', 'key') }
    const next = sheetReducer(start, { type: 'startEdit', how: 'replace' }, shape)
    expect(next.mode).toBe('edit')
    expect(next.editStart).toBe('replace')
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.anchor).toBeNull()
  })

  it('does not start an edit on a read-only cell', () => {
    const data = [
      rowA,
      row('r', 'ref', '1', { cells: { key: text('ref'), value: text('1', { readOnly: true }) } }),
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(
      sheetReducer(focus(cell('r', 'value')), { type: 'startEdit', how: 'keep' }, s).mode,
    ).toBe('navigate')
  })

  it('does not start an edit on a read-only row', () => {
    const data = [row('r', 'ref', '1', { readOnly: true })]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(sheetReducer(focus(cell('r', 'key')), { type: 'startEdit', how: 'keep' }, s).mode).toBe(
      'navigate',
    )
  })

  it('does not start an edit in a read-only column, and does not start one without an active cell', () => {
    const s = shapeOf(rows, [{ ...keyColumn, readOnly: true }, valueColumn], { trailingId: 't0' })
    expect(sheetReducer(focus(cell('a', 'key')), { type: 'startEdit', how: 'keep' }, s).mode).toBe(
      'navigate',
    )
    expect(sheetReducer(initialSheetState(), { type: 'startEdit', how: 'keep' }, shape).mode).toBe(
      'navigate',
    )
  })

  it('reaches a read-only cell with the cursor, and does not edit it', () => {
    const data = [
      row('a', 'highway', 'residential', {
        cells: { key: text('highway'), value: text('residential', { readOnly: true }) },
      }),
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    const moved = sheetReducer(focus(cell('a', 'key')), { type: 'move', dx: 1, dy: 0 }, s)
    expect(moved.active).toEqual(cell('a', 'value'))
    expect(sheetReducer(moved, { type: 'startEdit', how: 'keep' }, s).mode).toBe('navigate')
  })

  it('starts an edit in the trailing row', () => {
    const next = sheetReducer(
      focus(cell('t0', 'key')),
      { type: 'startEdit', how: 'replace' },
      shape,
    )
    expect(next.mode).toBe('edit')
  })

  it('Enter goes down in the column the Tab run began in', () => {
    let state = sheetReducer(editing(cell('a', 'key')), { type: 'endEdit', after: 'next' }, shape)
    expect(state.mode).toBe('navigate')
    expect(state.active).toEqual(cell('a', 'value'))
    expect(state.tabOrigin).toBe('key')
    state = sheetReducer(state, { type: 'startEdit', how: 'replace' }, shape)
    state = sheetReducer(state, { type: 'endEdit', after: 'down' }, shape)
    expect(state.active).toEqual(cell('b', 'key'))
    expect(state.tabOrigin).toBeNull()
  })

  it('Enter goes down in the active column without a Tab run, and Shift+Enter goes up', () => {
    const down = sheetReducer(
      editing(cell('a', 'value')),
      { type: 'endEdit', after: 'down' },
      shape,
    )
    expect(down.active).toEqual(cell('b', 'value'))
    const up = sheetReducer(editing(cell('b', 'value')), { type: 'endEdit', after: 'up' }, shape)
    expect(up.active).toEqual(cell('a', 'value'))
  })

  it('Enter on the last position stays there', () => {
    const next = sheetReducer(
      editing(cell('t0', 'value')),
      { type: 'endEdit', after: 'down' },
      shape,
    )
    expect(next.active).toEqual(cell('t0', 'value'))
    expect(next.mode).toBe('navigate')
  })

  it('an arrow ends the edit in the active column, ignoring the Tab run', () => {
    let state = sheetReducer(editing(cell('a', 'key')), { type: 'endEdit', after: 'next' }, shape)
    state = sheetReducer(state, { type: 'startEdit', how: 'replace' }, shape)
    const next = sheetReducer(state, { type: 'endEdit', after: 'arrowDown' }, shape)
    expect(next.active).toEqual(cell('b', 'value'))
    expect(next.tabOrigin).toBeNull()
  })

  it('Tab in edit mode moves on and wraps, and stays at the two ends', () => {
    const wrapped = sheetReducer(
      editing(cell('a', 'value')),
      { type: 'endEdit', after: 'next' },
      shape,
    )
    expect(wrapped.active).toEqual(cell('b', 'key'))
    const back = sheetReducer(
      editing(cell('b', 'key')),
      { type: 'endEdit', after: 'previous' },
      shape,
    )
    expect(back.active).toEqual(cell('a', 'value'))
    const atEnd = sheetReducer(
      editing(cell('t0', 'value')),
      { type: 'endEdit', after: 'next' },
      shape,
    )
    expect(atEnd.active).toEqual(cell('t0', 'value'))
    expect(atEnd.mode).toBe('navigate')
  })

  it('stay ends the edit and keeps the cell', () => {
    const next = sheetReducer(
      editing(cell('b', 'value')),
      { type: 'endEdit', after: 'stay' },
      shape,
    )
    expect(next.mode).toBe('navigate')
    expect(next.active).toEqual(cell('b', 'value'))
  })

  it('endEdit outside edit mode changes nothing', () => {
    const start = focus(cell('b', 'value'))
    expect(sheetReducer(start, { type: 'endEdit', after: 'down' }, shape)).toBe(start)
  })
})

describe('sheetReducer: rows that change under the cursor', () => {
  it('keeps the active cell on its row id when the rows are re-sorted', () => {
    const resorted = shapeOf([rowC, rowB, rowA], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      resorted,
    )
    expect(next.active).toEqual(cell('b', 'value'))
  })

  it('takes the same index when the active row is gone', () => {
    const remaining = shapeOf([rowA, rowC], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('b', 'value')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.active).toEqual(cell('c', 'value'))
  })

  it('clamps to the last position when the last row is gone', () => {
    const remaining = shapeOf([rowA], columns, { trailingId: 't0' })
    const next = sheetReducer(
      focus(cell('c', 'key')),
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.active).toEqual(cell('t0', 'key'))
  })

  it('drops an anchor whose row is gone', () => {
    const start: SheetState = { ...focus(cell('b', 'value')), anchor: cell('c', 'key') }
    const remaining = shapeOf([rowA, rowB], columns, { trailingId: 't0' })
    const next = sheetReducer(
      start,
      { type: 'rowsChanged', previousRowIds: ['a', 'b', 'c', 't0'] },
      remaining,
    )
    expect(next.anchor).toBeNull()
  })
})

describe('commitEdit', () => {
  it('a text equal to the current one gives no batch', () => {
    const result = commitEdit(editing(cell('a', 'value')), shape, rows, columns, 'residential')
    expect(result.batch).toBeUndefined()
    expect(result.state.mode).toBe('navigate')
  })

  it('clean runs before the comparison, so a padded key is unchanged', () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, '  highway  ')
    expect(result.batch).toBeUndefined()
  })

  it('sets a changed value as one batch, and ends the edit as `after` says', () => {
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, 'B', 'down')
    expect(result.batch).toEqual({
      cause: 'edit',
      changes: [{ type: 'set', row: 'b', col: 'value', text: 'B' }],
    })
    expect(result.state.active).toEqual(cell('c', 'value'))
    expect(result.state.mode).toBe('navigate')
  })

  it('an empty text clears the cell', () => {
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, '')
    expect(result.batch?.changes).toEqual([{ type: 'clear', row: 'b', col: 'value' }])
  })

  it('an empty text on an empty cell gives no batch', () => {
    const result = commitEdit(editing(cell('c', 'value')), shape, rows, columns, '')
    expect(result.batch).toBeUndefined()
  })

  it('a unique column refuses a text another row has, and moves the focus to that row', () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, 'name')
    expect(result.batch).toBeUndefined()
    expect(result.refused).toBeDefined()
    expect(result.focus).toEqual(cell('b', 'value'))
    expect(result.state.active).toEqual(cell('b', 'value'))
    expect(result.state.mode).toBe('navigate')
  })

  it("a unique column accepts the row's own text", () => {
    const result = commitEdit(editing(cell('a', 'key')), shape, rows, columns, 'highway')
    expect(result.refused).toBeUndefined()
    expect(result.batch).toBeUndefined()
  })

  it('the trailing row first commit is an insert with its id, and a new trailing id is minted', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, 'lit', 'down')
    expect(result.batch).toEqual({
      cause: 'edit',
      changes: [{ type: 'insert', row: 't0', cells: { key: 'lit' } }],
    })
    expect(result.state.trailingId).toBe('t1')
    expect(result.state.nextId).toBe(2)
    // Enter in the new row goes down, into the new trailing row.
    expect(result.state.active).toEqual(cell('t1', 'key'))
  })

  it('an empty text in the trailing row gives no batch and mints nothing', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, '')
    expect(result.batch).toBeUndefined()
    expect(result.state.trailingId).toBe('t0')
    expect(result.state.nextId).toBe(1)
  })

  it('a key that exists, typed in the trailing row, is refused', () => {
    const result = commitEdit(editing(cell('t0', 'key')), shape, rows, columns, 'highway')
    expect(result.batch).toBeUndefined()
    expect(result.focus).toEqual(cell('a', 'value'))
    expect(result.state.trailingId).toBe('t0')
  })

  it('a text over the limit is committed as typed, and the message is returned', () => {
    const long = 'x'.repeat(300)
    const result = commitEdit(editing(cell('b', 'value')), shape, rows, columns, long)
    expect(result.batch?.changes).toEqual([{ type: 'set', row: 'b', col: 'value', text: long }])
    expect(result.invalid).toBe('Too long')
  })

  it('an empty draft on a mixed value changes nothing, and a text sets it', () => {
    const mixedRow: SheetRow = {
      id: 'm',
      label: 'maxspeed',
      cells: {
        key: text('maxspeed'),
        value: {
          value: {
            kind: 'mixed',
            values: [
              { text: '30', count: 1 },
              { text: undefined, count: 1 },
            ],
          },
        },
      },
    }
    const s = shapeOf([mixedRow], columns, { trailingId: 't0' })
    expect(
      commitEdit(editing(cell('m', 'value')), s, [mixedRow], columns, '').batch,
    ).toBeUndefined()
    expect(
      commitEdit(editing(cell('m', 'value')), s, [mixedRow], columns, '50').batch?.changes,
    ).toEqual([{ type: 'set', row: 'm', col: 'value', text: '50' }])
  })

  it('does nothing when the cell is not being edited', () => {
    const result = commitEdit(focus(cell('b', 'value')), shape, rows, columns, 'B')
    expect(result.batch).toBeUndefined()
  })
})

describe('clearSelection', () => {
  it('clears the cells of a range in one batch', () => {
    const state: SheetState = { ...focus(cell('b', 'value')), anchor: cell('a', 'key') }
    const batch = clearSelection(state, shape, rows, columns)
    expect(batch?.cause).toBe('delete')
    expect(batch?.changes).toEqual([
      { type: 'clear', row: 'a', col: 'key' },
      { type: 'clear', row: 'a', col: 'value' },
      { type: 'clear', row: 'b', col: 'key' },
      { type: 'clear', row: 'b', col: 'value' },
    ])
  })

  it('an empty cell is not cleared: a range of empty cells gives no batch', () => {
    const single: SheetState = { ...focus(cell('c', 'value')), anchor: cell('c', 'value') }
    expect(clearSelection(single, shape, rows, columns)).toBeUndefined()
    const withKey: SheetState = { ...focus(cell('c', 'value')), anchor: cell('c', 'key') }
    expect(clearSelection(withKey, shape, rows, columns)?.changes).toEqual([
      { type: 'clear', row: 'c', col: 'key' },
    ])
  })

  it('removes whole rows when rows are selected, and skips read-only rows', () => {
    const data = [rowA, row('r', 'ref', '1', { readOnly: true }), row('c', 'surface', 'asphalt')]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    const state: SheetState = {
      ...focus(cell('c', 'value')),
      anchor: cell('a', 'key'),
      rowsSelected: true,
    }
    expect(clearSelection(state, s, data, columns)?.changes).toEqual([
      { type: 'remove', row: 'a' },
      { type: 'remove', row: 'c' },
    ])
  })

  it('skips a read-only cell', () => {
    const data = [
      row('a', 'highway', 'residential', {
        cells: { key: text('highway', { readOnly: true }), value: text('residential') },
      }),
      rowB,
    ]
    const s = shapeOf(data, columns, { trailingId: 't0' })
    expect(
      clearSelection({ ...focus(cell('a', 'key')), anchor: cell('a', 'key') }, s, data, columns),
    ).toBeUndefined()
    expect(
      clearSelection({ ...focus(cell('b', 'key')), anchor: cell('a', 'key') }, s, data, columns)
        ?.changes,
    ).toEqual([{ type: 'clear', row: 'b', col: 'key' }])
  })

  it('skips the cells of a read-only column', () => {
    const readOnlyValue = [keyColumn, { ...valueColumn, readOnly: true }]
    const s = shapeOf(rows, readOnlyValue, { trailingId: 't0' })
    expect(
      clearSelection(
        { ...focus(cell('b', 'value')), anchor: cell('a', 'value') },
        s,
        rows,
        readOnlyValue,
      ),
    ).toBeUndefined()
  })

  it('never clears the trailing row', () => {
    const state: SheetState = { ...focus(cell('t0', 'key')), anchor: cell('b', 'value') }
    expect(clearSelection(state, shape, rows, columns)?.changes).toEqual([
      { type: 'clear', row: 'b', col: 'key' },
      { type: 'clear', row: 'b', col: 'value' },
      { type: 'clear', row: 'c', col: 'key' },
    ])
  })

  it('without an active cell gives no batch', () => {
    expect(clearSelection(initialSheetState(), shape, rows, columns)).toBeUndefined()
  })
})

describe('shapeOf', () => {
  it('appends the trailing id last, and marks cells that cannot be edited', () => {
    expect(shape.rowIds).toEqual(['a', 'b', 'c', 't0'])
    expect(shape.readOnly(cell('t0', 'key'))).toBe(false)
    expect(
      shapeOf(rows, columns, { trailingId: 't0', sheetReadOnly: true }).readOnly(cell('a', 'key')),
    ).toBe(true)
    expect(shape.readOnly(cell('a', 'missing'))).toBe(true)
  })
})
