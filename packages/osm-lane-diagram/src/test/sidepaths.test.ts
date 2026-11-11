import { describe, expect, test } from 'bun:test'
import { expandSidepaths, formatSidepathFeatureId, parseSidepathFeatureId } from '../sidepaths'

describe('sidepath ids', () => {
  test('round-trip', () => {
    const ref = {
      osmType: 'way' as const,
      osmId: 123,
      prefix: 'cycleway' as const,
      side: 'left' as const,
    }
    expect(formatSidepathFeatureId(ref)).toBe('way/123/cycleway/left')
    expect(parseSidepathFeatureId('way/123/cycleway/left')).toEqual(ref)
  })

  test('invalid ids', () => {
    for (const id of [
      'way/123',
      'way/123/cycleway',
      'way/0/cycleway/left',
      'node/1/cycleway/left',
      'way/1/both/left',
    ]) {
      expect(parseSidepathFeatureId(id)).toBeNull()
    }
  })
})

describe('expandSidepaths', () => {
  test('bare cycleway=lane gives both sides', () => {
    const expanded = expandSidepaths(42, { highway: 'residential', cycleway: 'lane' })
    expect(expanded.map((entry) => entry.ref.side).sort()).toEqual(['left', 'right'])
    expect(
      expanded.every(
        (entry) => entry.tags.highway === 'cycleway' && entry.tags.cycleway === 'lane',
      ),
    ).toBe(true)
  })

  test('cycleway:both gives both sides', () => {
    expect(expandSidepaths(7, { highway: 'primary', 'cycleway:both': 'track' })).toHaveLength(2)
  })

  test('one tagged side, with its nested width', () => {
    const expanded = expandSidepaths(9, {
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:left:width': '1.5',
    })
    expect(expanded).toHaveLength(1)
    expect(expanded[0]?.ref).toEqual({ osmType: 'way', osmId: 9, prefix: 'cycleway', side: 'left' })
    expect(expanded[0]?.tags.width).toBe('1.5')
  })

  test('sided wins over both', () => {
    const expanded = expandSidepaths(3, {
      highway: 'residential',
      'sidewalk:both': 'yes',
      'sidewalk:right': 'separate',
    })
    expect(expanded.find((entry) => entry.ref.side === 'right')?.tags.sidewalk).toBe('separate')
    expect(expanded.find((entry) => entry.ref.side === 'left')?.tags.sidewalk).toBe('yes')
  })

  test('sidewalk=both and sidewalk=right', () => {
    expect(expandSidepaths(11, { highway: 'residential', sidewalk: 'both' })).toHaveLength(2)
    const right = expandSidepaths(11, { highway: 'residential', sidewalk: 'right' })
    expect(right.map((entry) => entry.ref.side)).toEqual(['right'])
    expect(right[0]?.tags.highway).toBe('footway')
  })

  test('a path is not split', () => {
    expect(expandSidepaths(99, { highway: 'cycleway', cycleway: 'track' })).toEqual([])
  })
})
