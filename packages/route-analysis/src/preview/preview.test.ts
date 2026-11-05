import { describe, expect, test } from 'bun:test'
import { analyzeRoute } from '../analyze.ts'
import type { RouteInput } from '../types.ts'
import { previewInput, stillMissing, withPreview } from './merge.ts'
import {
  parseRoutePreview,
  PreviewFormatError,
  relationNumber,
  routePreviewSql,
} from './postpass.ts'

const line = (points: [number, number][]) =>
  JSON.stringify({ type: 'LineString', coordinates: points })

/** An answer in Postpass's shape: a route r1 of three ways and a guidepost, a stage r2, an untagged way w4 */
const ANSWER = JSON.stringify({
  postpass_properties: { timestamp: '2026-11-05T04:00:00Z' },
  result: [
    {
      k: 'R',
      id: 1,
      tags: { type: 'route', route: 'hiking', name: 'Test' },
      members: [
        { type: 'W', ref: 1, role: '' },
        { type: 'W', ref: 2, role: '' },
        { type: 'W', ref: 3, role: '' },
        { type: 'W', ref: 4, role: '' },
        { type: 'N', ref: 9, role: 'guidepost' },
        { type: 'R', ref: 2, role: '' },
      ],
    },
    { k: 'R', id: 2, tags: { type: 'route' }, members: [{ type: 'W', ref: 3, role: '' }] },
    {
      k: 'W',
      id: 1,
      tags: { highway: 'path' },
      first: 10,
      last: 11,
      length_m: 111,
      geom: line([
        [13, 52],
        [13.001, 52],
      ]),
    },
    {
      k: 'W',
      id: 2,
      tags: { highway: 'path' },
      first: 11,
      last: 12,
      length_m: 111,
      geom: line([
        [13.001, 52],
        [13.0015, 52.0001],
        [13.002, 52],
      ]),
    },
    {
      k: 'W',
      id: 3,
      tags: { highway: 'path' },
      first: 12,
      last: 13,
      length_m: 111,
      geom: line([
        [13.002, 52],
        [13.003, 52],
      ]),
    },
    { k: 'W', id: 4, tags: null, first: 13, last: 14, length_m: null, geom: null },
    {
      k: 'N',
      id: 9,
      tags: { tourism: 'information' },
      geom: JSON.stringify({ type: 'Point', coordinates: [13.001, 52] }),
    },
  ],
})

describe('routePreviewSql', () => {
  test('puts only the validated number into the query', () => {
    const sql = routePreviewSql('r123')
    expect(sql.startsWith('-- maid:route-preview 123\n')).toBe(true)
    expect(sql).toContain('SELECT 123::bigint, 0')
    expect(sql.endsWith(';')).toBe(false)
  })
  test('refuses what is not a relation id', () => {
    expect(() => relationNumber('w5')).toThrow()
    expect(() => relationNumber('r1; DROP TABLE x')).toThrow()
    expect(() => relationNumber('r0')).toThrow()
    expect(relationNumber('42')).toBe(42)
  })
})

describe('parseRoutePreview', () => {
  const preview = parseRoutePreview('r1', ANSWER)
  test('reads relations, ways and nodes with Maid ids', () => {
    expect(preview.root).toBe('r1')
    expect(preview.timestamp).toBe('2026-11-05T04:00:00Z')
    expect([...preview.relations.keys()]).toEqual(['r1', 'r2'])
    expect(preview.relations.get('r1')?.members.map((member) => member.id)).toEqual([
      'w1',
      'w2',
      'w3',
      'w4',
      'n9',
      'r2',
    ])
    expect(preview.ways.get('w2')?.ends).toEqual(['n11', 'n12'])
    expect(preview.ways.get('w2')?.line).toHaveLength(3)
    expect(preview.nodes.get('n9')?.at).toEqual([13.001, 52])
  })
  test('an untagged way keeps its ends and has no line', () => {
    expect(preview.ways.get('w4')).toEqual({ id: 'w4', tags: {}, ends: ['n13', 'n14'] })
  })
  test('refuses an answer without the relation or of another shape', () => {
    expect(() => parseRoutePreview('r5', ANSWER)).toThrow(PreviewFormatError)
    expect(() => parseRoutePreview('r1', '<html>')).toThrow(PreviewFormatError)
    expect(() => parseRoutePreview('r1', '{"error":"timeout"}')).toThrow(PreviewFormatError)
  })
  test('takes the longest part of a polygon outline', () => {
    const outline = JSON.stringify({
      postpass_properties: { timestamp: 't' },
      result: [
        { k: 'R', id: 1, tags: {}, members: '[{"type":"W","ref":7,"role":""}]' },
        {
          k: 'W',
          id: 7,
          tags: { area: 'yes' },
          first: 1,
          last: 1,
          geom: JSON.stringify({
            type: 'MultiLineString',
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 0],
              ],
              [
                [0.2, 0.2],
                [0.3, 0.3],
              ],
            ],
          }),
        },
      ],
    })
    const parsed = parseRoutePreview('r1', outline)
    expect(parsed.relations.get('r1')?.members).toEqual([{ type: 'way', id: 'w7', role: '' }])
    expect(parsed.ways.get('w7')?.line).toHaveLength(4)
  })
})

describe('withPreview', () => {
  const preview = parseRoutePreview('r1', ANSWER)
  const relation = preview.relations.get('r1')!
  /** w1 is loaded for real, with its end node n11 slightly elsewhere than the preview has it */
  const loaded: RouteInput = {
    tags: relation.tags,
    members: relation.members,
    ways: new Map([['w1', ['n10', 'n11']]]),
    nodes: new Map([
      ['n10', [13, 52]],
      ['n11', [13.00101, 52]],
    ]),
  }
  const { input, previewed } = withPreview(loaded, preview)

  test('fills the members that are not loaded, loaded data wins', () => {
    expect([...previewed].sort()).toEqual(['n9', 'w2', 'w3'])
    expect(input.ways.get('w1')).toEqual(['n10', 'n11'])
    expect(input.ways.get('w2')).toEqual(['n11', 'w2:1', 'n12'])
    expect(input.nodes.get('n11')).toEqual([13.00101, 52])
    expect(input.memberTags?.get('n9')).toEqual({ tourism: 'information' })
  })
  test('a way without a shape stays missing', () => {
    expect(input.ways.has('w4')).toBe(false)
    expect(stillMissing(input)).toBe(1)
    expect(stillMissing(loaded)).toBe(4)
  })
  test('the analysis chains loaded and preview ways into one line', () => {
    const analysis = analyzeRoute(input)
    expect(analysis.chain.pieces).toHaveLength(1)
    expect(analysis.chain.pieces[0]?.steps.map((step) => step.wayId)).toEqual(['w1', 'w2', 'w3'])
  })
  test('a stage that is not loaded at all comes from the preview alone', () => {
    const stage = previewInput(preview, 'r2')
    expect(stage?.input.ways.get('w3')).toEqual(['n12', 'n13'])
    expect(previewInput(preview, 'r7')).toBeUndefined()
  })
})
