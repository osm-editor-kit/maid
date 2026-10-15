import { describe, expect, test } from 'bun:test'
import type { Lens } from '@osm-editor-kit/maid-style'
import {
  chosenLensId,
  lensActions,
  lensChoice,
  pendingLensChoice,
  restoreLenses,
} from './lens-store.ts'
import { NO_LENS } from './url.ts'

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

describe('the lens on the map, the choice and the stored choice', () => {
  // the URL sync (sync.ts) writes a request to the URL and remembers it; these tests play its part with the same actions
  const reset = () => {
    const pending = pendingLensChoice()
    if (pending) lensActions.answer(pending)
    lensActions.remember(NO_LENS)
    lensActions.setShown(null)
  }

  test('a link shows its lens and writes no choice', () => {
    reset()
    lensActions.setShown('surface')
    expect(lensChoice.getActiveId()).toBe('surface')
    expect(chosenLensId()).toBeNull()
  })

  test('a choice is a request until the URL sync writes it; then it is remembered', () => {
    reset()
    lensChoice.setActive('lit')
    expect(pendingLensChoice()).toEqual({ id: 'lit' })
    expect(chosenLensId()).toBeNull()
    const request = pendingLensChoice()
    if (request === null) throw new Error('a choice is a request')
    lensActions.remember('lit')
    lensActions.setShown('lit')
    lensActions.answer(request)
    expect(pendingLensChoice()).toBeNull()
    expect(lensChoice.getActiveId()).toBe('lit')
    expect(chosenLensId()).toBe('lit')
  })

  test('a newer choice is not cleared by the answer to an older one', () => {
    reset()
    lensChoice.setActive('lit')
    const older = pendingLensChoice()
    lensChoice.setActive('surface')
    if (older) lensActions.answer(older)
    expect(pendingLensChoice()).toEqual({ id: 'surface' })
  })

  test('a choice of none is remembered as no choice', () => {
    reset()
    lensActions.remember('lit')
    lensActions.remember(NO_LENS)
    expect(chosenLensId()).toBeNull()
  })

  test('a link over the stored choice shows the link and keeps the choice', () => {
    reset()
    lensActions.remember('lit')
    lensActions.setShown('surface')
    expect(lensChoice.getActiveId()).toBe('surface')
    expect(chosenLensId()).toBe('lit')
  })

  test('removing the imported lens clears the stored choice that named it', () => {
    reset()
    const imported: Lens = { ...lens, id: 'imported-one' }
    lensActions.importLenses([imported])
    lensActions.remember('imported-one')
    lensActions.removeLens('imported-one')
    expect(chosenLensId()).toBeNull()
  })
})
