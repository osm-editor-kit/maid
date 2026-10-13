import { describe, expect, it } from 'bun:test'
import { actionForKey, type SheetKeyEvent, type SheetKeyResult } from './keys.ts'
import { initialSheetState, shapeOf } from './reducer.ts'
import type { SheetCellData, SheetColumn, SheetRow, SheetShape, SheetState } from './types.ts'

const keyColumn: SheetColumn = { id: 'key', header: 'Key', width: '2fr', unique: true }
const valueColumn: SheetColumn = { id: 'value', header: 'Value', width: '3fr' }
const columns: SheetColumn[] = [keyColumn, valueColumn]

function text(value: string, extra: Partial<SheetCellData> = {}): SheetCellData {
  return { value: { kind: 'value', text: value }, ...extra }
}

const rows: SheetRow[] = [
  { id: 'a', label: 'highway', cells: { key: text('highway'), value: text('residential') } },
  { id: 'b', label: 'name', cells: { key: text('name'), value: text('A') } },
  {
    id: 'r',
    label: 'ref',
    cells: { key: text('ref'), value: text('1', { readOnly: true }) },
  },
]
// Trailing row t0 is the last position of the grid.
const shape: SheetShape = shapeOf(rows, columns, { trailingId: 't0' })

const mac = { mac: true }
const other = { mac: false }

function ev(key: string, mods: Partial<Omit<SheetKeyEvent, 'key'>> = {}): SheetKeyEvent {
  return { key, shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, ...mods }
}

function nav(row: string, col: string): SheetState {
  return { ...initialSheetState(), active: { row, col } }
}

function edit(row: string, col: string): SheetState {
  return { ...nav(row, col), mode: 'edit' }
}

describe('navigation: arrows and the range', () => {
  it('an arrow moves the active cell and prevents the default', () => {
    expect(actionForKey(ev('ArrowUp'), nav('b', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 0, dy: -1, extend: false },
      prevent: true,
    })
    expect(actionForKey(ev('ArrowRight'), nav('b', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, extend: false },
      prevent: true,
    })
  })

  it('Shift+arrows extend the range', () => {
    const result = actionForKey(ev('ArrowDown', { shiftKey: true }), nav('a', 'key'), shape, mac)
    expect(result).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 0, dy: 1, extend: true },
      prevent: true,
    })
  })

  it('Cmd (or Ctrl off the Mac) with an arrow goes to the edge, Shift extends to it', () => {
    expect(actionForKey(ev('ArrowRight', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, edge: true, extend: false },
      prevent: true,
    })
    expect(
      actionForKey(ev('ArrowDown', { metaKey: true, shiftKey: true }), nav('a', 'key'), shape, mac),
    ).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 0, dy: 1, edge: true, extend: true },
      prevent: true,
    })
    expect(
      actionForKey(ev('ArrowRight', { ctrlKey: true }), nav('a', 'key'), shape, other),
    ).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, edge: true, extend: false },
      prevent: true,
    })
  })

  it('Home and End go to the ends of the row', () => {
    expect(actionForKey(ev('Home'), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: -1, dy: 0, edge: true, extend: false },
      prevent: true,
    })
    expect(actionForKey(ev('End', { shiftKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, edge: true, extend: true },
      prevent: true,
    })
  })

  it('Shift+Space selects the active row', () => {
    expect(actionForKey(ev(' ', { shiftKey: true }), nav('b', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'selectRows', from: 'b' },
      prevent: true,
    })
  })

  it('Escape collapses a range, and is left to the page when there is none', () => {
    expect(actionForKey(ev('Escape'), nav('a', 'key'), shape, mac)).toEqual({ kind: 'native' })
    const ranged: SheetState = { ...nav('b', 'value'), anchor: { row: 'a', col: 'key' } }
    expect(actionForKey(ev('Escape'), ranged, shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'collapse' },
      prevent: true,
    })
  })

  it('Cmd/Ctrl+A selects all', () => {
    expect(actionForKey(ev('a', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'selectAll' },
      prevent: true,
    })
    expect(actionForKey(ev('a', { ctrlKey: true }), nav('a', 'key'), shape, other)).toEqual({
      kind: 'action',
      action: { type: 'selectAll' },
      prevent: true,
    })
  })
})

describe('navigation: Tab, Enter and typing', () => {
  it('Tab and Shift+Tab move and wrap', () => {
    expect(actionForKey(ev('Tab'), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, wrap: true },
      prevent: true,
    })
    expect(actionForKey(ev('Tab', { shiftKey: true }), nav('b', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: -1, dy: 0, wrap: true },
      prevent: true,
    })
  })

  it('Tab leaves the sheet at its two ends: the browser moves the focus', () => {
    expect(actionForKey(ev('Tab'), nav('t0', 'value'), shape, mac)).toEqual({ kind: 'native' })
    expect(actionForKey(ev('Tab', { shiftKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'native',
    })
  })

  it('Enter and F2 start an edit that keeps the text', () => {
    const start: SheetKeyResult = {
      kind: 'action',
      action: { type: 'startEdit', how: 'keep' },
      prevent: true,
    }
    expect(actionForKey(ev('Enter'), nav('a', 'value'), shape, mac)).toEqual(start)
    expect(actionForKey(ev('F2'), nav('a', 'value'), shape, mac)).toEqual(start)
  })

  it('Shift+Enter moves up', () => {
    expect(actionForKey(ev('Enter', { shiftKey: true }), nav('b', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 0, dy: -1 },
      prevent: true,
    })
  })

  it('a printable character starts an edit that replaces the text, and the input gets the key', () => {
    expect(actionForKey(ev('x'), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'startEdit', how: 'replace' },
      prevent: false,
    })
    expect(actionForKey(ev('Q', { shiftKey: true }), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'startEdit', how: 'replace' },
      prevent: false,
    })
    expect(actionForKey(ev(' '), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'startEdit', how: 'replace' },
      prevent: false,
    })
  })

  it('dead keys and an IME start an edit', () => {
    expect(actionForKey(ev('Dead'), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'startEdit', how: 'replace' },
      prevent: false,
    })
    expect(actionForKey(ev('Process'), nav('a', 'value'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'startEdit', how: 'replace' },
      prevent: false,
    })
  })

  it('Delete and Backspace clear the selection', () => {
    expect(actionForKey(ev('Delete'), nav('a', 'value'), shape, mac)).toEqual({ kind: 'clear' })
    expect(actionForKey(ev('Backspace'), nav('a', 'value'), shape, mac)).toEqual({ kind: 'clear' })
  })
})

describe('navigation: read-only cells', () => {
  it('a read-only cell cannot start an edit: Enter, F2 and typing are left to the input', () => {
    expect(actionForKey(ev('Enter'), nav('r', 'value'), shape, mac)).toEqual({ kind: 'native' })
    expect(actionForKey(ev('F2'), nav('r', 'value'), shape, mac)).toEqual({ kind: 'native' })
    expect(actionForKey(ev('x'), nav('r', 'value'), shape, mac)).toEqual({ kind: 'native' })
  })

  it('a read-only cell can still be moved to', () => {
    expect(actionForKey(ev('ArrowRight'), nav('r', 'key'), shape, mac)).toEqual({
      kind: 'action',
      action: { type: 'move', dx: 1, dy: 0, extend: false },
      prevent: true,
    })
  })
})

describe('navigation: clipboard, undo and modifiers', () => {
  it('Cmd/Ctrl+C, X and V are clipboard requests', () => {
    expect(actionForKey(ev('c', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'clipboard',
      op: 'copy',
    })
    expect(actionForKey(ev('x', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'clipboard',
      op: 'cut',
    })
    expect(actionForKey(ev('v', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'clipboard',
      op: 'paste',
    })
    expect(
      actionForKey(ev('V', { ctrlKey: true, shiftKey: true }), nav('a', 'key'), shape, other),
    ).toEqual({
      kind: 'clipboard',
      op: 'paste',
    })
  })

  it('Cmd/Ctrl+Z is undo, Shift+Cmd/Ctrl+Z and Ctrl+Y are redo', () => {
    expect(actionForKey(ev('z', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'undo',
    })
    expect(
      actionForKey(ev('Z', { metaKey: true, shiftKey: true }), nav('a', 'key'), shape, mac),
    ).toEqual({ kind: 'redo' })
    expect(actionForKey(ev('z', { ctrlKey: true }), nav('a', 'key'), shape, other)).toEqual({
      kind: 'undo',
    })
    expect(actionForKey(ev('y', { ctrlKey: true }), nav('a', 'key'), shape, other)).toEqual({
      kind: 'redo',
    })
    expect(actionForKey(ev('y', { ctrlKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'native',
    })
  })

  it('the Mac uses Cmd, and Ctrl+C there is not the copy key (and Cmd+C elsewhere is not either)', () => {
    expect(actionForKey(ev('c', { ctrlKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'native',
    })
    expect(actionForKey(ev('c', { metaKey: true }), nav('a', 'key'), shape, other)).toEqual({
      kind: 'native',
    })
    expect(actionForKey(ev('c', { ctrlKey: true }), nav('a', 'key'), shape, other)).toEqual({
      kind: 'clipboard',
      op: 'copy',
    })
  })

  it('other Cmd/Ctrl combinations, Alt and a missing active cell are left to the page', () => {
    expect(actionForKey(ev('b', { metaKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'native',
    })
    expect(actionForKey(ev('ArrowUp', { altKey: true }), nav('a', 'key'), shape, mac)).toEqual({
      kind: 'native',
    })
    expect(actionForKey(ev('ArrowUp'), initialSheetState(), shape, mac)).toEqual({ kind: 'native' })
  })

  it('an IME composition is always left to the input', () => {
    expect(
      actionForKey({ ...ev('Enter'), isComposing: true }, nav('a', 'value'), shape, mac),
    ).toEqual({ kind: 'native' })
  })
})

describe('edit mode', () => {
  it('Enter commits and goes down, Shift+Enter commits and goes up', () => {
    expect(actionForKey(ev('Enter'), edit('a', 'value'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'down',
      prevent: true,
    })
    expect(actionForKey(ev('Enter', { shiftKey: true }), edit('a', 'value'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'up',
      prevent: true,
    })
  })

  it('Tab commits and moves on, Shift+Tab commits and moves back', () => {
    expect(actionForKey(ev('Tab'), edit('a', 'key'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'next',
      prevent: true,
    })
    expect(actionForKey(ev('Tab', { shiftKey: true }), edit('a', 'value'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'previous',
      prevent: true,
    })
  })

  it('a Tab from the last cell commits and lets the browser move the focus out', () => {
    expect(actionForKey(ev('Tab'), edit('t0', 'value'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'next',
      prevent: false,
    })
    expect(actionForKey(ev('Tab', { shiftKey: true }), edit('a', 'key'), shape, mac)).toEqual({
      kind: 'commit',
      after: 'previous',
      prevent: false,
    })
  })

  it('Up and Down are the suggestion list first: an arrow result', () => {
    expect(actionForKey(ev('ArrowUp'), edit('b', 'key'), shape, mac)).toEqual({
      kind: 'arrow',
      dy: -1,
    })
    expect(actionForKey(ev('ArrowDown'), edit('a', 'key'), shape, mac)).toEqual({
      kind: 'arrow',
      dy: 1,
    })
  })

  it('Shift+Up and Shift+Down select text in the input', () => {
    expect(actionForKey(ev('ArrowDown', { shiftKey: true }), edit('a', 'key'), shape, mac)).toEqual(
      { kind: 'native' },
    )
  })

  it('Escape drops the draft', () => {
    expect(actionForKey(ev('Escape'), edit('a', 'value'), shape, mac)).toEqual({ kind: 'cancel' })
  })

  it('typing, the caret, delete, select all, undo and paste are the input own', () => {
    const native: SheetKeyResult = { kind: 'native' }
    for (const event of [
      ev('x'),
      ev('ArrowLeft'),
      ev('ArrowRight'),
      ev('ArrowLeft', { shiftKey: true }),
      ev('Delete'),
      ev('Backspace'),
      ev('F2'),
      ev('Home'),
      ev('End'),
      ev('a', { metaKey: true }),
      ev('z', { metaKey: true }),
      ev('v', { metaKey: true }),
      ev('Enter', { metaKey: true }),
    ]) {
      expect(actionForKey(event, edit('a', 'value'), shape, mac)).toEqual(native)
    }
  })

  it('on another platform Ctrl+A is the input own, Cmd+A is not the page key', () => {
    expect(actionForKey(ev('a', { ctrlKey: true }), edit('a', 'value'), shape, other)).toEqual({
      kind: 'native',
    })
  })

  it('an IME composition in edit mode is left to the input', () => {
    expect(
      actionForKey({ ...ev('Enter'), isComposing: true }, edit('a', 'value'), shape, mac),
    ).toEqual({ kind: 'native' })
  })
})
