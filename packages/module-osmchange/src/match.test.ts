import { describe, expect, test } from 'bun:test'
import { matchCreates, type NearbyElement, RECENT_MS, resolveFile } from './match.ts'
import { parseOsmChange } from './parse.ts'
import { planOf } from './plan.ts'
import type { ServerState } from './types.ts'

function file(xml: string) {
  const result = parseOsmChange(`<osmChange version="0.6">${xml}</osmChange>`)
  if (!result.ok) throw new Error(result.error.id)
  return result.file
}

/** Degrees of latitude for a distance in metres */
const north = (metres: number) => metres / 111_195
const NOW = Date.parse('2026-10-23T18:00:00Z')
const node = (
  id: number,
  lat: number,
  tags: Record<string, string>,
  timestamp?: string,
): NearbyElement => ({
  type: 'node',
  id,
  version: 1,
  tags,
  lat,
  lon: 13,
  ...(timestamp ? { timestamp } : {}),
})

describe('matchCreates: already on the server', () => {
  // the file read again after its upload: the crossing and the footway over it are on the server now
  const changes = file(
    `<create>
       <node id="-1" lat="52" lon="13"><tag k="highway" v="crossing"/></node>
       <way id="-2"><nd ref="5"/><nd ref="-1"/><tag k="highway" v="footway"/></way>
     </create>
     <modify><way id="7" version="3"><nd ref="5"/><nd ref="-1"/><nd ref="6"/><tag k="highway" v="residential"/></way></modify>`,
  )
  const server: NearbyElement[] = [
    node(900, 52 + north(0.01), { highway: 'crossing' }),
    { type: 'way', id: 901, version: 1, tags: { highway: 'footway' }, nodes: [5, 900] },
  ]

  test('a node with the same tags at the same place, a way with the same tags over the same nodes', () => {
    const matches = matchCreates(changes, server, NOW)
    expect([...matches.same]).toEqual([
      ['n-1', 'n900'],
      ['w-2', 'w901'],
    ])
  })

  test('references to them go to the existing elements, and they are not created again', () => {
    const matches = matchCreates(changes, server, NOW)
    const resolved = resolveFile(changes, matches.same)
    expect(resolved.changes[2]!.element.nodes).toEqual([5, 900, 6])
    const states = new Map<string, ServerState>([
      [
        'w7',
        {
          current: {
            type: 'way',
            id: 7,
            version: 4,
            tags: { highway: 'residential' },
            nodes: [5, 900, 6],
          },
          base: { type: 'way', id: 7, version: 3, tags: { highway: 'residential' }, nodes: [5, 6] },
        },
      ],
    ])
    const plan = planOf(changes, states, new Map(), {}, matches)
    expect(plan.items.map((item) => `${item.key}:${item.status}`)).toEqual([
      'n-1:skip',
      'w-2:skip',
      'w7:skip',
    ])
    expect(plan.items[0]!.notes).toEqual([
      { id: 'osmchange_note_already_created', values: { id: 'n900' } },
    ])
  })

  test('other tags, or further away, is not the same', () => {
    expect(
      matchCreates(changes, [node(900, 52, { highway: 'crossing', crossing: 'zebra' })], NOW).same
        .size,
    ).toBe(0)
    expect(
      matchCreates(changes, [node(900, 52 + north(2), { highway: 'crossing' })], NOW).same.size,
    ).toBe(0)
  })
})

describe('matchCreates: possible duplicates', () => {
  const parking = file(
    '<create><node id="-1" lat="52" lon="13" timestamp="2026-10-20T10:00:00Z"><tag k="amenity" v="bicycle_parking"/><tag k="capacity" v="6"/></node></create>',
  )

  test('the same main tag nearby, added after the file element was made: a decision', () => {
    const since = node(800, 52 + north(4), { amenity: 'bicycle_parking' }, '2026-10-22T09:00:00Z')
    const before = node(801, 52 + north(6), { amenity: 'bicycle_parking' }, '2026-01-01T09:00:00Z')
    const far = node(802, 52 + north(40), { amenity: 'bicycle_parking' }, '2026-10-22T09:00:00Z')
    const other = node(803, 52 + north(2), { amenity: 'bench' }, '2026-10-22T09:00:00Z')
    const matches = matchCreates(
      parking,
      [since, before, far, other],
      NOW,
      new Map([['n-1', '2026-10-20T10:00:00Z']]),
    )
    expect(matches.duplicates.get('n-1')).toEqual([
      { key: 'n800', metres: 4, timestamp: '2026-10-22T09:00:00Z' },
    ])
    const plan = planOf(parking, new Map(), new Map(), {}, matches)
    expect(plan.items[0]).toMatchObject({ status: 'decide', result: undefined })
    expect(
      planOf(parking, new Map(), new Map(), { 'n-1:duplicate': 'file' }, matches).items[0]!.result,
    ).toMatchObject({
      id: -1,
    })
    const existing = planOf(parking, new Map(), new Map(), { 'n-1:duplicate': 'current' }, matches)
    expect(existing.items[0]!.result).toBeUndefined()
    expect(existing.ready).toBe(false)
  })

  test('without a timestamp in the file: added in the last 24 hours', () => {
    const plain = file(
      '<create><node id="-1" lat="52" lon="13"><tag k="amenity" v="bicycle_parking"/></node></create>',
    )
    const recent = node(
      800,
      52 + north(4),
      { amenity: 'bicycle_parking' },
      new Date(NOW - RECENT_MS / 2).toISOString(),
    )
    const old = node(
      801,
      52 + north(4),
      { amenity: 'bicycle_parking' },
      new Date(NOW - 2 * RECENT_MS).toISOString(),
    )
    expect(matchCreates(plain, [recent], NOW).duplicates.size).toBe(1)
    expect(matchCreates(plain, [old], NOW).duplicates.size).toBe(0)
  })

  test("a node of one of the file's ways is not checked for duplicates", () => {
    const crossing = file(
      '<create><node id="-1" lat="52" lon="13"><tag k="highway" v="crossing"/></node></create><modify><way id="7" version="1"><nd ref="5"/><nd ref="-1"/></way></modify>',
    )
    const since = node(
      800,
      52 + north(3),
      { highway: 'crossing' },
      new Date(NOW - 1000).toISOString(),
    )
    expect(matchCreates(crossing, [since], NOW).duplicates.size).toBe(0)
  })

  test("a node that is a member of the file's new relation is not checked for duplicates", () => {
    const stop = file(
      '<create><node id="-1" lat="52" lon="13"><tag k="highway" v="bus_stop"/></node><relation id="-2"><member type="node" ref="-1" role="stop"/><tag k="type" v="route"/></relation></create>',
    )
    const since = node(
      800,
      52 + north(3),
      { highway: 'bus_stop' },
      new Date(NOW - 1000).toISOString(),
    )
    expect(matchCreates(stop, [since], NOW).duplicates.size).toBe(0)
  })

  test('an element the file changes itself is never a match', () => {
    const changes = file(
      '<create><node id="-1" lat="52" lon="13"><tag k="amenity" v="bench"/></node></create><modify><node id="900" version="1" lat="52" lon="13"><tag k="amenity" v="bench"/></node></modify>',
    )
    expect(matchCreates(changes, [node(900, 52, { amenity: 'bench' })], NOW).same.size).toBe(0)
  })
})
