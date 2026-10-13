import { describe, expect, it } from 'bun:test'
import { browseOf, RECENTS_TO_SHOW } from './browse.ts'
import { createPresets } from './presets.ts'
import type { PresetData } from './types.ts'

// Adopted from iD test/spec/presets/index.js, "PresetIndex.recents" (ISC, © iD contributors), at commit 0194f3926.
// iD's test stubs the location manager; here the location sets are real, and the places are a point in Germany
// and one in Kansas. The locations are checked against the bundled country borders.
const GERMANY: [number, number] = [10, 51]
const KANSAS: [number, number] = [-98.5, 39.8]

const pointPreset = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  tags: { test: name },
  geometry: ['point', 'vertex'],
  ...extra,
})

const data: PresetData = {
  presets: {
    'test/p1': pointPreset('P1'),
    'test/p3': pointPreset('P3'),
    'test/p5': pointPreset('P5'),
    'test/us': pointPreset('US only', { locationSet: { include: ['us'] } }),
    'test/us_b': pointPreset('US only B', { locationSet: { include: ['us'] } }),
    'test/hidden': pointPreset('Hidden', { searchable: false }),
    'test/line': { name: 'A line', tags: { test: 'line' }, geometry: ['line'] },
    'test/p0': pointPreset('P0'),
    'test/p2': pointPreset('P2'),
    'test/p4': pointPreset('P4'),
    'test/p6': pointPreset('P6'),
    'test/p7': pointPreset('P7'),
    'test/p8': pointPreset('P8'),
    'test/p9': pointPreset('P9'),
  },
  fields: {},
  translations: {},
}

const presets = createPresets(data)
const ids = (found: { id: string }[]) => found.map((preset) => preset.id)

describe('browseOf.recent', () => {
  it('fills all recent slots even when some remembered presets are not in the region (iD #11405)', () => {
    const browse = browseOf(presets, ['point'], GERMANY)
    const found = browse.recent(['test/p1', 'test/us', 'test/p3', 'test/us_b', 'test/p5'])
    expect(ids(found)).toEqual(['test/p1', 'test/p3', 'test/p5'])
  })

  it('lists the presets of the places they are used in: the US ones are listed in Kansas', () => {
    const browse = browseOf(presets, ['point'], KANSAS)
    expect(ids(browse.recent(['test/us', 'test/p1', 'test/us_b']))).toEqual([
      'test/us',
      'test/p1',
      'test/us_b',
    ])
  })

  it('without a place every location set holds, as in the search', () => {
    const browse = browseOf(presets, ['point'])
    expect(ids(browse.recent(['test/p1', 'test/us', 'test/p3', 'test/us_b']))).toEqual([
      'test/p1',
      'test/us',
      'test/p3',
      'test/us_b',
    ])
  })

  it('keeps the most recent order and shows at most eight, as iD (MAX_RECENTS_TO_SHOW)', () => {
    expect(RECENTS_TO_SHOW).toBe(8)
    const browse = browseOf(presets, ['point'], GERMANY)
    const all = [
      'test/p0',
      'test/p2',
      'test/p4',
      'test/p6',
      'test/p7',
      'test/p8',
      'test/p9',
      'test/p1',
      'test/p3',
      'test/p5',
    ]
    expect(ids(browse.recent(all))).toEqual(all.slice(0, 8))
  })

  it('leaves out a hidden preset, which is not offered', () => {
    const browse = browseOf(presets, ['point'], GERMANY)
    expect(ids(browse.recent(['test/hidden', 'test/p1']))).toEqual(['test/p1'])
  })

  it('leaves out a preset that does not match the geometries of the feature', () => {
    expect(ids(browseOf(presets, ['point'], GERMANY).recent(['test/line', 'test/p1']))).toEqual([
      'test/p1',
    ])
    // with the vertex too, the line stays out and the point preset (point and vertex) stays in
    expect(ids(browseOf(presets, ['point', 'vertex']).recent(['test/line', 'test/p1']))).toEqual([
      'test/p1',
    ])
  })

  it('lists an id once, and skips an id that is no preset', () => {
    const browse = browseOf(presets, ['point'], GERMANY)
    expect(ids(browse.recent(['nothing', 'test/p1', 'test/p1', 'test/p3']))).toEqual([
      'test/p1',
      'test/p3',
    ])
  })

  it('gives nothing without ids, and for an empty list of geometries', () => {
    expect(browseOf(presets, ['point'], GERMANY).recent([])).toEqual([])
    expect(browseOf(presets, [], GERMANY).recent(['test/p1'])).toEqual([])
  })
})

describe('browseOf.defaults', () => {
  it('is the defaults of the presets for the geometries (the picker lists them after the recents)', () => {
    const browse = browseOf(presets, ['point'], GERMANY)
    expect(browse.defaults).toEqual(presets.defaults(['point']))
  })
})
