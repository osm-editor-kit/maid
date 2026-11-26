/**
 * The street drawing of the dense fixture: every coordinate a number, the time of a first drawing and of a node drag
 * step, and a drag step drawn around the change giving the same features as drawing everything again.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { streetCollector, type StreetGraph } from './street-collect.ts'
import type { StreetEntity } from './street.ts'

type Element = {
  type: string
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}

function denseBase(): Map<string, StreetEntity> {
  const file = new URL('../../../../fixtures/dense.json.gz', import.meta.url)
  const data = JSON.parse(gunzipSync(readFileSync(file)).toString()) as { elements: Element[] }
  const entities = new Map<string, StreetEntity>()
  for (const e of data.elements) {
    if (e.type === 'node')
      entities.set(`n${e.id}`, { id: `n${e.id}`, tags: e.tags ?? {}, loc: [e.lon!, e.lat!] })
    else if (e.type === 'way')
      entities.set(`w${e.id}`, {
        id: `w${e.id}`,
        tags: e.tags ?? {},
        nodes: e.nodes!.map((n) => `n${n}`),
      })
  }
  return entities
}

function graphOf(
  base: Map<string, StreetEntity>,
  local = new Map<string, StreetEntity | undefined>(),
): StreetGraph {
  return {
    base: { entities: base },
    local: { entities: local },
    hasEntity: (id) => (local.has(id) ? local.get(id) : base.get(id)),
  }
}

const finite = (value: unknown): boolean =>
  Array.isArray(value)
    ? value.every(finite)
    : typeof value === 'number'
      ? Number.isFinite(value)
      : true

/** A collection's features as sorted JSON, rounded to a centimetre or so */
const canonical = (features: { geometry: unknown; properties: unknown }[]) =>
  features
    .map((f) =>
      JSON.stringify([f.properties, f.geometry], (_, v) =>
        typeof v === 'number' ? Math.round(v * 1e7) / 1e7 : v,
      ),
    )
    .sort()

describe('the street drawing of the dense fixture', () => {
  const base = denseBase()

  test('every lane road is drawn, with finite coordinates, in reasonable time', () => {
    const collector = streetCollector()
    const t = performance.now()
    const drawn = collector.update(graphOf(base))
    const ms = performance.now() - t
    console.log(
      `street, dense: ${drawn.areas.features.length} areas, ${drawn.lines.features.length} lines, ${ms.toFixed(0)} ms`,
    )
    expect(drawn.areas.features.length).toBeGreaterThan(5000)
    for (const f of [...drawn.areas.features, ...drawn.lines.features, ...drawn.arrows.features]) {
      expect(finite((f.geometry as { coordinates: unknown }).coordinates)).toBe(true)
    }
    expect(ms).toBeLessThan(2000)
  })

  test('a node drag step is drawn around the change, the same as drawing everything again', () => {
    const collector = streetCollector()
    collector.update(graphOf(base))
    // a node of Karl-Marx-Straße, moved 2 m
    const way = base.get('w960167546')!
    const nodeId = way.nodes![1]!
    const node = base.get(nodeId)!
    const moved = { ...node, loc: [node.loc![0]! + 0.00003, node.loc![1]!] as [number, number] }
    const local = new Map<string, StreetEntity | undefined>([[nodeId, moved]])
    const t = performance.now()
    const step = collector.update(graphOf(base, local))
    const ms = performance.now() - t
    console.log(`street, dense: a drag step ${ms.toFixed(1)} ms`)
    const fresh = streetCollector().update(graphOf(base, local))
    expect(canonical(step.areas.features)).toEqual(canonical(fresh.areas.features))
    expect(canonical(step.lines.features)).toEqual(canonical(fresh.lines.features))
    expect(canonical(step.arrows.features)).toEqual(canonical(fresh.arrows.features))
    expect(ms).toBeLessThan(100)
  })

  test('nothing changed: the same collections', () => {
    const collector = streetCollector()
    const first = collector.update(graphOf(base))
    expect(collector.update(graphOf(base))).toBe(first)
  })
})
