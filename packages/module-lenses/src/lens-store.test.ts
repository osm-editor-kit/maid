import { describe, expect, test } from 'bun:test'
import type { Lens } from '@osm-editor-kit/maid-style'
import { chosenLensId, lensActions, lensChoice, restoreLenses } from './lens-store.ts'

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

describe('the lens on the map and the stored choice', () => {
  const reset = () => {
    lensActions.setActive(null)
    lensActions.showFromUrl(null)
  }

  test('a link shows its lens and writes no choice', () => {
    reset()
    expect(lensActions.showFromUrl('surface')).toBe('surface')
    expect(lensChoice.getActiveId()).toBe('surface')
    expect(chosenLensId()).toBeNull()
  })

  test('a choice is shown and remembered', () => {
    reset()
    lensChoice.setActive('lit')
    expect(lensChoice.getActiveId()).toBe('lit')
    expect(chosenLensId()).toBe('lit')
  })

  test('without a URL value the stored choice is shown; a link over it does not change the choice', () => {
    reset()
    lensChoice.setActive('lit')
    expect(lensActions.showFromUrl(null)).toBe('lit')
    expect(lensActions.showFromUrl('surface')).toBe('surface')
    expect(chosenLensId()).toBe('lit')
  })

  test('an unknown id in the URL shows none and keeps the choice', () => {
    reset()
    lensChoice.setActive('lit')
    expect(lensActions.showFromUrl('not-a-lens')).toBeNull()
    expect(chosenLensId()).toBe('lit')
  })

  test('removing the lens on the map clears both the choice and what is shown', () => {
    reset()
    const imported: Lens = { ...lens, id: 'imported-one' }
    lensActions.importLenses([imported])
    lensChoice.setActive('imported-one')
    lensActions.removeLens('imported-one')
    expect(lensChoice.getActiveId()).toBeNull()
    expect(chosenLensId()).toBeNull()
  })
})
