import { describe, expect, test } from 'bun:test'
import { toMapZoom, toOsmZoom } from './zoom.ts'

describe('zoom conventions', () => {
  test('OSM zoom is MapLibre zoom plus one', () => {
    expect(toOsmZoom(13)).toBe(14)
    expect(toOsmZoom(15)).toBe(16)
  })

  test('the inverse gives MapLibre zoom back', () => {
    expect(toMapZoom(toOsmZoom(12.5))).toBe(12.5)
    expect(toMapZoom(14)).toBe(13)
  })
})
