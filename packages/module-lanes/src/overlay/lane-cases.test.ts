/**
 * The street drawing of the made-up lane cases (fixtures/lanes, `bun run fixtures-lanes`; what each shows is in
 * fixtures/lanes/cases.json). Every case: each way drawn, finite coordinates, no lane or junction outline crossing
 * itself. Then what each case is about, where it can be put in numbers. The same case files go to other lane editors,
 * so these expectations are the ones to compare.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import type { StreetGeometry } from '@osm-editor-kit/osm-lane-diagram/street'
import { streetOf, type StreetEntity } from './street.ts'

type CaseFile = {
  nodes: Record<string, { loc: [number, number]; tags: Record<string, string> }>
  ways: { id: string; nodes: string[]; tags: Record<string, string> }[]
}
type Entry = { id: string; title: string; file: string; centre: [number, number] }

const root = new URL('../../../../fixtures/lanes/', import.meta.url)
const catalogue = JSON.parse(readFileSync(new URL('cases.json', root), 'utf8')) as Entry[]

function draw(id: string) {
  const entry = catalogue.find((e) => e.id === id)!
  const data = JSON.parse(readFileSync(new URL(entry.file, root), 'utf8')) as CaseFile
  const nodes = new Map<string, StreetEntity>(
    Object.entries(data.nodes).map(([nid, n]) => [nid, { id: nid, tags: n.tags, loc: n.loc }]),
  )
  const ways: StreetEntity[] = data.ways.map((w) => ({ id: w.id, tags: w.tags, nodes: w.nodes }))
  const { geometry, assumed } = streetOf(ways, (nid) => nodes.get(nid))
  const [lon0, lat0] = entry.centre
  const kx = Math.cos((lat0 * Math.PI) / 180) * 111_320
  /** Metres east and north of the case's middle */
  const metres = (loc: readonly number[]): [number, number] => [
    (loc[0]! - lon0) * kx,
    (loc[1]! - lat0) * 111_320,
  ]
  const wayNamed = (name: string) => data.ways.filter((w) => w.tags.name === name).map((w) => w.id)
  return { data, geometry, assumed, metres, wayNamed }
}

function crosses(ring: readonly (readonly number[])[]) {
  const o = (p: readonly number[], q: readonly number[], r: readonly number[]) =>
    Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!))
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const [a, b, c, d] = [ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!]
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true
    }
  }
  return false
}

const tapers = (g: StreetGeometry) => g.lanes.filter((l) => l.taper)

describe('every lane case', () => {
  for (const entry of catalogue) {
    test(`${entry.id} ${entry.title}: every way drawn, finite, no outline crossing itself`, () => {
      const { data, geometry } = draw(entry.id)
      for (const way of data.ways) {
        // a short way inside a junction of several nodes is part of the junction's surface (L12)
        const inside = geometry.junctions.some((j) =>
          way.nodes.every((n) => j.nodeIds?.includes(n)),
        )
        if (!inside) expect(geometry.lanes.some((l) => l.wayId === way.id)).toBe(true)
      }
      for (const polygon of [
        ...geometry.lanes.map((l) => l.ring),
        ...geometry.junctions.map((j) => j.ring),
      ]) {
        expect(polygon.flat().every(Number.isFinite)).toBe(true)
        expect(crosses(polygon)).toBe(false)
      }
    })
  }
})

describe('what each case is about', () => {
  test('L01 straight on: no junction, no taper', () => {
    const { geometry } = draw('L01')
    expect(geometry.junctions).toHaveLength(0)
    expect(tapers(geometry)).toHaveLength(0)
  })

  test('L04 a right-turn lane added: one lane narrows to nothing on each road with two lanes', () => {
    const { geometry } = draw('L04')
    expect(tapers(geometry)).toHaveLength(2)
  })

  test('L06 four lanes become two: the two outer lanes narrow to nothing', () => {
    const { geometry } = draw('L06')
    expect(tapers(geometry)).toHaveLength(2)
  })

  test('L07 an unmarked road meets a marked one: the kerbs ease, nothing narrows to a point', () => {
    const { geometry } = draw('L07')
    expect(tapers(geometry)).toHaveLength(0)
  })

  test('L08 T-junction: the side street starts at the main road’s kerb, not inside its lanes', () => {
    const { geometry, metres, wayNamed } = draw('L08')
    const main = new Set(wayNamed('L08 Main'))
    const side = new Set(wayNamed('L08 Side'))
    const ys = (ids: Set<string>) =>
      geometry.lanes
        .filter((l) => ids.has(l.wayId) && !l.taper)
        .flatMap((l) => l.ring.map((p) => metres(p)[1]))
    // the side street runs south from the main road: its northmost point is at the main road's south kerb
    expect(Math.max(...ys(side))).toBeLessThan(Math.min(...ys(main)) + 0.3)
    expect(geometry.junctions).toHaveLength(1)
  })

  test('L09 crossroads with turn lanes: an arrow per turning lane, before the junction', () => {
    const { geometry } = draw('L09')
    expect(geometry.arrows.map((a) => a.turn).sort()).toEqual([
      'left',
      'left',
      'through;right',
      'through;right',
    ])
  })

  test('L11 a road splits into a dual carriageway: one junction, no taper', () => {
    const { geometry } = draw('L11')
    expect(geometry.junctions).toHaveLength(1)
    expect(tapers(geometry)).toHaveLength(0)
  })

  test('L12 a dual carriageway crossed by a road: one junction of both crossings, the carriageways run through', () => {
    const { geometry, wayNamed } = draw('L12')
    expect(geometry.junctions).toHaveLength(1)
    expect(geometry.junctions[0]!.nodeIds).toHaveLength(2)
    for (const id of wayNamed('L12 Avenue'))
      expect(geometry.lanes.filter((l) => l.wayId === id).length).toBeGreaterThan(0)
  })

  test('L18 staggered junction: one junction of both side streets', () => {
    const { geometry } = draw('L18')
    expect(geometry.junctions).toHaveLength(1)
  })

  test('L13 a roundabout: every arm stops outside the ring (radius 30 m, lanes 3 m either side)', () => {
    const { geometry, metres, wayNamed } = draw('L13')
    const arms = new Set(['L13 Arm 1', 'L13 Arm 2', 'L13 Arm 3', 'L13 Arm 4'].flatMap(wayNamed))
    const nearest = Math.min(
      ...geometry.lanes
        .filter((l) => arms.has(l.wayId))
        .flatMap((l) => l.ring.map((p) => Math.hypot(...metres(p)))),
    )
    expect(nearest).toBeGreaterThan(33)
  })

  test('L14 a bus lane ends: it narrows to nothing as a bus lane', () => {
    const { geometry } = draw('L14')
    expect(tapers(geometry).map((l) => l.kind)).toEqual(['bus'])
  })

  test('L15 a cycle lane between the lanes: drawn as a cycle lane', () => {
    const { geometry } = draw('L15')
    expect(
      geometry.lanes.filter((l) => l.kind === 'bicycle' && !l.taper).length,
    ).toBeGreaterThanOrEqual(3)
  })

  test('L17 a one-way road drawn against its traffic: the lanes carry on, no taper', () => {
    const { geometry } = draw('L17')
    expect(tapers(geometry)).toHaveLength(0)
    expect(geometry.arrows.map((a) => a.turn).sort()).toEqual([
      'left',
      'through',
      'through',
      'through',
    ])
  })

  test('L21 small streets without lane tags: each drawn as an assumed carriageway', () => {
    const { data, assumed } = draw('L21')
    expect(assumed.size).toBe(data.ways.length)
  })

  test('L22 widths per lane: the lanes ease to their new widths, nothing narrows to nothing', () => {
    const { geometry } = draw('L22')
    expect(tapers(geometry)).toHaveLength(0)
  })
})
