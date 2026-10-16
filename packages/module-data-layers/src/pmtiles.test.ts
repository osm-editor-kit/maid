import { describe, expect, test } from 'bun:test'
import { registerPmtilesProtocol, sourceLayerNames } from './pmtiles.ts'

describe('sourceLayerNames', () => {
  test('reads the vector layer ids of the metadata, in order, without repeats or blanks', () => {
    const metadata = {
      vector_layers: [
        { id: 'buildings' },
        { id: 'roads' },
        { id: 'buildings' },
        { id: '' },
        { name: 'x' },
      ],
    }
    expect(sourceLayerNames(metadata)).toEqual(['buildings', 'roads'])
  })

  test('metadata without vector layers has no names', () => {
    expect(sourceLayerNames({ name: 'raster' })).toEqual([])
    expect(sourceLayerNames(undefined)).toEqual([])
    expect(sourceLayerNames({ vector_layers: 'roads' })).toEqual([])
  })
})

describe('registerPmtilesProtocol', () => {
  test('registers the pmtiles protocol with the library it is given', () => {
    const calls: string[] = []
    registerPmtilesProtocol((name) => {
      calls.push(name)
    })
    expect(calls).toEqual(['pmtiles'])
  })
})

describe('sourceLayerNames with metadata that is not an object', () => {
  test('an array or a number has no layer names', () => {
    expect(sourceLayerNames([{ id: 'roads' }])).toEqual([])
    expect(sourceLayerNames({ vector_layers: [{ id: 5 }] })).toEqual([])
  })
})
