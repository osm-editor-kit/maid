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
  test('registers the pmtiles protocol once per library object', () => {
    const calls: string[] = []
    const lib = {
      addProtocol: (name: string) => {
        calls.push(name)
      },
    }
    registerPmtilesProtocol(lib)
    registerPmtilesProtocol(lib)
    expect(calls).toEqual(['pmtiles'])
  })

  test('a library without addProtocol is left alone', () => {
    expect(() => registerPmtilesProtocol({})).not.toThrow()
  })
})
