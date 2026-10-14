import { describe, expect, test } from 'bun:test'
import { type Bbox, fixtureBounds } from './scene-bounds'

const table: Record<string, Bbox> = { small: [1, 2, 3, 4] }

describe('fixtureBounds', () => {
  test('the extent of the fixture the scene is cut from', () => {
    expect(fixtureBounds({ source: 'mock', scene: 'small' }, table)).toEqual([1, 2, 3, 4])
  })

  test('none for live data, even when the scene is known', () => {
    expect(fixtureBounds({ source: 'osm', scene: 'small' }, table)).toBeUndefined()
  })

  test('none for a scene the table does not know', () => {
    expect(fixtureBounds({ source: 'mock', scene: 'unknown' }, table)).toBeUndefined()
  })
})
