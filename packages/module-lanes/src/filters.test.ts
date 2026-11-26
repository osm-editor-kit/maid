import { describe, expect, it } from 'bun:test'
import { createFilterSet, defaultFilters } from '@osm-editor-kit/maid-filters'
import { streetPoints } from './filters.ts'

describe('streetPoints', () => {
  const set = createFilterSet(
    [
      streetPoints,
      ...defaultFilters.map((f) =>
        f.id === 'points' || f.id === 'shops' ? { ...f, state: 'hidden' as const } : f,
      ),
    ],
    '',
  )
  it('keeps the points about the road, read-only, and hides the other points and shops', () => {
    expect(set.stateOf({ traffic_sign: 'DE:237' }, 'point')).toBe('readonly')
    expect(set.stateOf({ highway: 'bus_stop', name: 'Rathaus Neukölln' }, 'point')).toBe('readonly')
    expect(set.stateOf({ barrier: 'bollard' }, 'point')).toBe('readonly')
    expect(set.stateOf({ amenity: 'bench' }, 'point')).toBe('hidden')
    expect(set.stateOf({ shop: 'bakery' }, 'point')).toBe('hidden')
  })
  it('leaves vertices and ways to the other filters', () => {
    expect(set.stateOf({ highway: 'primary' }, 'line')).toBe('editable')
  })
})
