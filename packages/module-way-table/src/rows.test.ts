import { describe, expect, test } from 'bun:test'
import { buildRows, groupOf, GROUPS, globToRegExp, type RowGroup } from './rows.ts'
import type { Column } from './types.ts'

const reference: Column = {
  id: 'R',
  reversed: false,
  tags: {
    name: 'Mill Road',
    highway: 'residential',
    surface: 'asphalt',
    'cycleway:left': 'lane',
    lit: 'yes',
  },
}
const second: Column = {
  id: 'S',
  reversed: false,
  tags: {
    highway: 'residential',
    surface: 'paving_stones',
    maxspeed: '30',
    'parking:left': 'parallel',
  },
}
const reversed: Column = {
  id: 'T',
  reversed: true,
  tags: { highway: 'residential', 'cycleway:right': 'lane' },
}

function keysOf(groups: RowGroup[]): string[] {
  return groups.flatMap((group) => group.rows.map((row) => row.key))
}

describe('groupOf', () => {
  test('sorts keys into the groups of the design', () => {
    const expected: [string, string][] = [
      ['name', 'name'],
      ['source:name', 'name'],
      ['highway', 'road'],
      ['maxspeed:forward', 'road'],
      ['oneway:bicycle', 'road'],
      ['lanes:forward', 'lanes'],
      ['turn:lanes:forward', 'lanes'],
      ['placement', 'lanes'],
      ['parking:lane:left', 'parking'],
      ['cycleway:left', 'cycling'],
      ['bicycle_road', 'cycling'],
      ['sidewalk:left', 'footway'],
      ['footway', 'footway'],
      ['waterway', 'water-rail'],
      ['railway:track_ref', 'water-rail'],
      ['building:levels', 'building'],
      ['roof:shape', 'building'],
      ['addr:street', 'building'],
      ['note', 'other'],
      ['name:en', 'other'],
    ]
    for (const [key, group] of expected) {
      expect([key, groupOf(key)]).toEqual([key, group])
    }
  })

  test('the Other group catches every key', () => {
    expect(GROUPS.at(-1)?.id).toBe('other')
    expect(groupOf('anything_at_all')).toBe('other')
  })

  test('globs match the whole key, with * as any text', () => {
    expect(globToRegExp('maxspeed*').test('maxspeed:hgv')).toBe(true)
    expect(globToRegExp('maxspeed*').test('xmaxspeed')).toBe(false)
    expect(globToRegExp('*:cycleway').test('source:cycleway')).toBe(true)
    expect(globToRegExp('*:cycleway').test('cycleway:left')).toBe(false)
    expect(globToRegExp('a.b').test('axb')).toBe(false)
  })
})

describe('buildRows', () => {
  test('the union of the keys, in groups in the design order, with the empty groups hidden', () => {
    const groups = buildRows([reference, second], { referenceId: 'R' })
    expect(groups.map((group) => group.id)).toEqual(['name', 'road', 'parking', 'cycling'])
    expect(keysOf(groups)).toEqual([
      'name',
      'highway',
      'lit',
      'maxspeed',
      'surface',
      'parking:left',
      'cycleway:left',
    ])
  })

  test('preset keys come first inside a group, then A to Z', () => {
    const groups = buildRows([reference, second], {
      referenceId: 'R',
      keyOrder: ['surface', 'highway'],
    })
    const road = groups.find((group) => group.id === 'road')
    expect(road?.rows.map((row) => row.key)).toEqual(['surface', 'highway', 'lit', 'maxspeed'])
  })

  test('a row differs when a column is different, added or missing; the group counts them', () => {
    const groups = buildRows([reference, second], { referenceId: 'R' })
    const road = groups.find((group) => group.id === 'road')
    const byKey = new Map(road?.rows.map((row) => [row.key, row]))
    expect(byKey.get('highway')?.differs).toBe(false)
    expect(byKey.get('surface')?.differs).toBe(true)
    expect(byKey.get('lit')?.differs).toBe(true)
    expect(byKey.get('maxspeed')?.differs).toBe(true)
    expect(road?.differing).toBe(3)
  })

  test('onlyDiffering keeps the rows that differ, and the count stays', () => {
    const groups = buildRows([reference, second], { referenceId: 'R', onlyDiffering: true })
    expect(keysOf(groups)).toEqual([
      'name',
      'lit',
      'maxspeed',
      'surface',
      'parking:left',
      'cycleway:left',
    ])
    expect(groups.find((group) => group.id === 'road')?.differing).toBe(3)
  })

  test('every cell carries its state: the reference, same, missing, added', () => {
    const groups = buildRows([reference, second], { referenceId: 'R' })
    const road = groups.find((group) => group.id === 'road')
    const surface = road?.rows.find((row) => row.key === 'surface')
    expect(surface?.cells.R?.state).toBe('reference')
    expect(surface?.cells.S?.state).toBe('different')
    expect(surface?.cells.S?.value).toBe('paving_stones')
    const lit = road?.rows.find((row) => row.key === 'lit')
    expect(lit?.cells.S?.state).toBe('missing')
    const maxspeed = road?.rows.find((row) => row.key === 'maxspeed')
    expect(maxspeed?.cells.R?.state).toBe('empty')
    expect(maxspeed?.cells.S?.state).toBe('added')
  })

  test('a reversed column shows its directional keys mirrored, with the dependent marker', () => {
    const groups = buildRows([reference, reversed], { referenceId: 'R' })
    const cycling = groups.find((group) => group.id === 'cycling')
    expect(cycling?.rows.map((row) => row.key)).toEqual(['cycleway:left'])
    const row = cycling?.rows[0]
    expect(row?.cells.T).toEqual({ state: 'same', dependent: true, value: 'lane' })
    expect(row?.differs).toBe(false)
  })

  test('the reference is an id of the columns; without it, the rows still come out', () => {
    const groups = buildRows([reference, second], { referenceId: 'nope' })
    const road = groups.find((group) => group.id === 'road')
    expect(road?.rows.find((row) => row.key === 'highway')?.cells.R?.state).toBe('added')
  })

  test('a custom group list replaces the design groups', () => {
    const groups = buildRows([reference, second], {
      referenceId: 'R',
      groups: [{ id: 'other', patterns: ['*'] }],
    })
    expect(groups.map((group) => group.id)).toEqual(['other'])
    expect(groups[0]?.rows.length).toBe(7)
  })
})
