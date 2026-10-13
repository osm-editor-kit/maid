import { describe, expect, it } from 'bun:test'
import { createEditor } from '@osm-editor-kit/maid-core'
import { backgroundName, usedNames } from './helpers.ts'
import { imagery } from './index.ts'
import { createImageryStore } from './store.ts'

const names = {
  bing: 'Bing aerial imagery',
  dop: 'DOP 20 (Berlin)',
  roads: 'Road overlay',
}

describe('usedNames', () => {
  it('gives the background alone when no overlay is chosen', () => {
    expect(usedNames('bing', [], names)).toEqual(['Bing aerial imagery'])
  })

  it('gives the background first, then the overlays in the order they were chosen', () => {
    expect(usedNames('bing', ['roads', 'dop'], names)).toEqual([
      'Bing aerial imagery',
      'Road overlay',
      'DOP 20 (Berlin)',
    ])
  })

  it('gives nothing with no background and no overlay', () => {
    expect(usedNames(null, [], names)).toEqual([])
  })

  it('gives the overlays alone when there is no background', () => {
    expect(usedNames(null, ['dop'], names)).toEqual(['DOP 20 (Berlin)'])
  })

  it('leaves out a layer that is chosen but not drawn yet (no name is known)', () => {
    expect(usedNames('bing', ['roads'], { roads: 'Road overlay' })).toEqual(['Road overlay'])
    expect(usedNames('bing', [], {})).toEqual([])
  })
})

describe('backgroundName', () => {
  it('gives the name of the background', () => {
    expect(backgroundName('bing', names)).toBe('Bing aerial imagery')
  })

  it('gives nothing for no background, or one that is not drawn yet', () => {
    expect(backgroundName(null, names)).toBeUndefined()
    expect(backgroundName('unknown', names)).toBeUndefined()
  })

  it('gives nothing when only an overlay is drawn: the overlay is not a source', () => {
    // the background is not chosen, so the name the store holds for the overlay is not a background
    expect(backgroundName(null, { dop: 'DOP 20 (Berlin)' })).toBeUndefined()
  })
})

describe('the store of the imagery module', () => {
  it('cites a background and an overlay once their names are remembered', () => {
    const store = createImageryStore(null)
    expect(usedNames(store.getState().backgroundId, store.getState().overlayIds, {})).toEqual([])
    store.getState().setBackground('bing')
    store.getState().setOverlay('roads', true)
    store.getState().remember({ bing: 'Bing aerial imagery', roads: 'Road overlay' })
    const state = store.getState()
    expect(usedNames(state.backgroundId, state.overlayIds, state.names)).toEqual([
      'Bing aerial imagery',
      'Road overlay',
    ])
    expect(backgroundName(state.backgroundId, state.names)).toBe('Bing aerial imagery')
  })
})

describe('the imagery module contributes imagery.used', () => {
  it('registers one item with no imagery visible to start with', () => {
    const editor = createEditor({ modules: [imagery()] })
    const items = editor.registry('imagery.used').list()
    expect(items.map((item) => item.id)).toEqual(['imagery'])
    expect(items[0]?.used()).toEqual([])
    expect(items[0]?.background()).toBeUndefined()
    editor.destroy()
  })
})
