import { describe, expect, it } from 'bun:test'
import { measureTags } from './measure-tags.ts'

describe('measureTags', () => {
  it('writes the distance and the background as its source', () => {
    expect(measureTags('width', 3.5, 'Bing aerial imagery')).toEqual({
      width: '3.5',
      'source:width': 'Bing aerial imagery',
    })
  })

  it('writes only the distance without a background (none chosen, or the plain style)', () => {
    expect(measureTags('width', 3.5, undefined)).toEqual({ width: '3.5' })
    expect(measureTags('width', 3.5, '  ')).toEqual({ width: '3.5' })
  })

  it('replaces an existing source once merged over the feature tags', () => {
    const existing = { highway: 'residential', width: '6', 'source:width': 'survey' }
    expect({ ...existing, ...measureTags('width', 4.2, 'DOP 20 (Berlin)') }).toEqual({
      highway: 'residential',
      width: '4.2',
      'source:width': 'DOP 20 (Berlin)',
    })
  })

  it('keeps an existing source when there is no background to name', () => {
    const existing = { width: '6', 'source:width': 'survey' }
    expect({ ...existing, ...measureTags('width', 4.2, undefined) }).toEqual({
      width: '4.2',
      'source:width': 'survey',
    })
  })

  it('writes the source under the key of a side field', () => {
    expect(measureTags('cycleway:left:width', 1.8, 'Bing aerial imagery')).toEqual({
      'cycleway:left:width': '1.8',
      'source:cycleway:left:width': 'Bing aerial imagery',
    })
  })

  it('rounds the distance to one decimal, and writes a whole number without one', () => {
    expect(measureTags('width', 3.46, undefined)).toEqual({ width: '3.5' })
    expect(measureTags('width', 12, undefined)).toEqual({ width: '12' })
  })

  it('writes nothing for a distance that rounds to zero', () => {
    expect(measureTags('width', 0, 'Bing aerial imagery')).toEqual({})
    expect(measureTags('width', 0.02, 'Bing aerial imagery')).toEqual({})
    expect(measureTags('width', Number.NaN, 'Bing aerial imagery')).toEqual({})
  })
})
