import { describe, expect, test } from 'bun:test'
import type { Lens } from '@osm-editor-kit/maid-style'
import { restoreLenses } from './lens-store.ts'

const current: { activeId: string | null; imported: Lens[] } = { activeId: null, imported: [] }
const lens: Lens = {
  id: 'my-lens',
  name: 'My lens',
  rules: [{ match: { highway: true }, color: '#f00' }],
}

describe('restoreLenses', () => {
  test('nothing stored, or something that is not the stored shape, gives the current state', () => {
    expect(restoreLenses(undefined, current)).toBe(current)
    expect(restoreLenses('lenses', current)).toBe(current)
    expect(restoreLenses({ activeId: 3, imported: [] }, current)).toBe(current)
  })

  test('a stored lens that does not parse makes the whole stored state fall back to the default', () => {
    const broken = { ...lens, rules: [{ match: { highway: true }, color: 'red-ish' }] }
    expect(restoreLenses({ activeId: 'my-lens', imported: [broken] }, current)).toBe(current)
  })

  test('a valid stored state is read back', () => {
    const stored = restoreLenses({ activeId: 'my-lens', imported: [lens] }, current)
    expect(stored).toEqual({ activeId: 'my-lens', imported: [lens] })
  })
})
