import { describe, expect, test } from 'bun:test'
import {
  floorChoices,
  floorsIn,
  idsInView,
  levelLabel,
  levelPickerShown,
  levelStatus,
  sameFloors,
} from './LevelPicker.tsx'

const entities: Record<string, { tags: Record<string, string> }> = {
  n1: { tags: { amenity: 'toilets', level: '-1.7' } },
  w2: { tags: { building: 'yes', min_level: '1', max_level: '3' } },
  w3: { tags: { highway: 'footway' } },
}
const entityOf = (id: string) => entities[id]

describe('idsInView', () => {
  test('keeps the string ids once each, and drops features without one', () => {
    const ids = idsInView([{ id: 'w2' }, { id: 'w2' }, { id: 7 }, {}, { id: 'n1' }])
    expect([...ids].sort()).toEqual(['n1', 'w2'])
  })
})

describe('floorsIn', () => {
  test('lists the floors of the entities in view, with 0 and sorted', () => {
    expect(floorsIn(['n1', 'w2', 'w3'], entityOf)).toEqual([-1.7, 0, 1, 2, 3])
  })

  test('ignores ids the data does not know', () => {
    expect(floorsIn(['missing'], entityOf)).toEqual([0])
    expect(floorsIn([], entityOf)).toEqual([0])
  })
})

describe('floorChoices', () => {
  test('lists the floors highest first', () => {
    expect(floorChoices([-1.7, 0, 2], null)).toEqual([2, 0, -1.7])
  })

  test('keeps the chosen level in the list when no feature in view is on it', () => {
    expect(floorChoices([0, 2], 5)).toEqual([5, 2, 0])
    expect(floorChoices([0, 2], 2)).toEqual([2, 0])
  })
})

describe('levelPickerShown', () => {
  test('is hidden below OSM zoom 17, even with a level chosen', () => {
    expect(levelPickerShown(16.9, [0, 2], null)).toBe(false)
    expect(levelPickerShown(16, [0, 2], 2)).toBe(false)
  })

  test('shows at zoom 17 when some feature in view has a level other than the ground', () => {
    expect(levelPickerShown(17, [0, 2], null)).toBe(true)
    expect(levelPickerShown(18, [0], null)).toBe(false)
  })

  test('shows while a level is chosen', () => {
    expect(levelPickerShown(17, [0], 0)).toBe(true)
  })
})

describe('labels and status', () => {
  test('a level is labelled as OSM writes it', () => {
    expect(levelLabel(-1.7)).toBe('-1.7')
    expect(levelLabel(0)).toBe('0')
    expect(levelLabel(2)).toBe('2')
  })

  test('the status line names the level', () => {
    expect(levelStatus(0)).toBe('Editing level 0 · other levels dimmed and locked')
  })
})

describe('sameFloors', () => {
  test('compares the lists in order', () => {
    expect(sameFloors([0, 1], [0, 1])).toBe(true)
    expect(sameFloors([0, 1], [1, 0])).toBe(false)
    expect(sameFloors([0], [0, 1])).toBe(false)
  })
})
