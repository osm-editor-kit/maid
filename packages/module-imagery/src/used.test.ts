import { describe, expect, it } from 'bun:test'
import { createEditor } from '@osm-editor-kit/maid-core'
import { backgroundName, usedNames } from './helpers.ts'
import { VISIT_ID } from './imagery-store.ts'
import { imagery } from './index.ts'

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

describe('the imagery module contributes imagery.used', () => {
  it('registers one item with no imagery visible to start with', () => {
    const editor = createEditor({ modules: [imagery()] })
    const items = editor.registry('imagery.used').list()
    expect(items.map((item) => item.id)).toEqual(['imagery'])
    expect(items[0]?.used()).toEqual([])
    expect(items[0]?.background()).toBeUndefined()
    editor.destroy()
  })

  it('cites the shown background by the name of its draw, read from the query cache', () => {
    const module = imagery()
    const editor = createEditor({ modules: [module] })
    const template = 'https://tiles.example.org/{z}/{x}/{y}.png'
    expect(module.visitBackground(template).ok).toBe(true)
    // the draw's result is the cache's, not the store's: nothing is cited until it is there
    const source = { type: 'raster' as const, tiles: [template], tileSize: 256 }
    editor.queries.setQueryData(['imagery', 'custom', VISIT_ID, template, 1], {
      id: VISIT_ID,
      name: 'Link background',
      source,
    })
    const item = editor.registry('imagery.used').list()[0]
    expect(item?.used()).toEqual(['Link background'])
    expect(item?.background()).toBe('Link background')
    editor.destroy()
  })
})
