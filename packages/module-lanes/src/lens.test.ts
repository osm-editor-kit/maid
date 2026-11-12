import { describe, expect, test } from 'bun:test'
import { laneStatus } from './lens.ts'

describe('laneStatus', () => {
  test('values per lane are green', () => {
    expect(laneStatus({ highway: 'primary', lanes: '2', 'turn:lanes': 'left|through' })).toBe(
      'rich',
    )
  })
  test('a count alone is amber, also per direction', () => {
    expect(laneStatus({ highway: 'secondary', lanes: '2' })).toBe('count')
    expect(laneStatus({ highway: 'secondary', 'lanes:forward': '1' })).toBe('count')
  })
  test('a main road without lane tags is missing, a minor one is minor', () => {
    expect(laneStatus({ highway: 'tertiary' })).toBe('missing')
    expect(laneStatus({ highway: 'residential' })).toBe('minor')
  })
  test('a minor road with a count is amber like any other', () => {
    expect(laneStatus({ highway: 'residential', lanes: '2' })).toBe('count')
  })
  test('no status for what the lens does not colour', () => {
    expect(laneStatus({ highway: 'footway' })).toBeNull()
  })
})
