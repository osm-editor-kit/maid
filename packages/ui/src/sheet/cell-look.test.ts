import { describe, expect, it } from 'bun:test'
import {
  cellClassName,
  cellStyle,
  counterText,
  EDGE_BOTTOM,
  EDGE_LEFT,
  EDGE_RIGHT,
  EDGE_TOP,
  inputClassName,
  rangeEdges,
} from './cell-look.ts'

describe('rangeEdges: the outline sides of a cell in a range', () => {
  const rect = { r0: 1, r1: 3, c0: 0, c1: 1 }
  it('the top-left cell has the top and the left side', () => {
    expect(rangeEdges(1, 0, rect)).toBe(EDGE_TOP | EDGE_LEFT)
  })
  it('the bottom-right cell has the bottom and the right side', () => {
    expect(rangeEdges(3, 1, rect)).toBe(EDGE_BOTTOM | EDGE_RIGHT)
  })
  it('an inner cell has no side', () => {
    expect(rangeEdges(2, 0, { r0: 0, r1: 4, c0: 0, c1: 1 })).toBe(EDGE_LEFT)
  })
})

describe('cellStyle: the rings of a cell', () => {
  it('no ring for a plain cell', () => {
    expect(
      cellStyle({ selected: false, active: false, editing: false, invalid: false, edges: 0 }),
    ).toBeUndefined()
  })

  it('the active cell has a ring, a thicker one while it is edited', () => {
    const navigate = cellStyle({
      selected: true,
      active: true,
      editing: false,
      invalid: false,
      edges: 0,
    })
    const edit = cellStyle({
      selected: true,
      active: true,
      editing: true,
      invalid: false,
      edges: 0,
    })
    expect(String(navigate?.boxShadow)).toContain('0 0 0 2px')
    expect(String(edit?.boxShadow)).toContain('0 0 0 3px')
  })

  it('an edge of the range is a line on that side, and an invalid cell is outlined in red', () => {
    const style = cellStyle({
      selected: true,
      active: false,
      editing: false,
      invalid: true,
      edges: EDGE_TOP,
    })
    const shadow = String(style?.boxShadow)
    expect(shadow).toContain('inset 0 2px 0 0')
    expect(shadow).toContain('#ef4444')
  })
})

describe('cellClassName and inputClassName: the classes decide the look', () => {
  it('a selected cell has a fill, a plain one does not', () => {
    expect(cellClassName({ selected: true })).toContain('bg-blue-500/10')
    expect(cellClassName({ selected: false })).not.toContain('bg-blue-500/10')
  })

  it('a key or value in monospace; a mixed value in italics; the text selectable only while edited', () => {
    const plain = inputClassName({ mono: false, tone: 'default', mixed: false, editing: false })
    const key = inputClassName({ mono: true, tone: 'default', mixed: false, editing: true })
    const mixed = inputClassName({ mono: false, tone: 'default', mixed: true, editing: false })
    expect(plain).not.toContain('font-mono')
    expect(key).toContain('font-mono')
    expect(key).toContain('select-text')
    expect(plain).not.toContain('select-text')
    expect(mixed).toContain('italic')
  })

  it('a differing value is amber, a muted one grey', () => {
    expect(
      inputClassName({ mono: false, tone: 'differs', mixed: false, editing: false }),
    ).toContain('text-amber-700')
    expect(inputClassName({ mono: false, tone: 'muted', mixed: false, editing: false })).toContain(
      'text-zinc-500',
    )
  })
})

describe('counterText: the length of a value, from 10 characters before the limit', () => {
  it('silent while the value is short', () => {
    expect(counterText('abc')).toBeUndefined()
    expect(counterText('x'.repeat(244))).toBeUndefined()
  })
  it('neutral up to the limit', () => {
    expect(counterText('x'.repeat(250))).toBe('250 / 255 characters')
  })
  it('says how far over the limit', () => {
    expect(counterText('x'.repeat(300))).toBe('300 / 255 characters, 45 characters too long')
    expect(counterText('x'.repeat(256))).toBe('256 / 255 characters, 1 character too long')
  })
})
