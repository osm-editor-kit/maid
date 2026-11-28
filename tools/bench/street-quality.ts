import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { streetOf, type StreetEntity } from '../../packages/module-lanes/src/overlay/street.ts'
/**
 * The quality of the lanes street drawing (module-lanes `streetOf`, osm-lane-diagram `street`) on a fixture: how many
 * junction and lane outlines cross themselves, with the way and node ids and the place of each crossing, and how long
 * the whole drawing takes. No browser, no network: the fixture file only.
 *
 *   bun run street-quality [scene=dense] [--runs 7]
 *
 * Writes reports/street-quality.json (or reports/street-quality-<scene>.json for another scene).
 */

const ROOT = resolve(import.meta.dir, '../..')
const args = process.argv.slice(2)
const runsAt = args.indexOf('--runs')
const RUNS = runsAt >= 0 ? Number(args[runsAt + 1]) : 7
const scene = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--runs') ?? 'dense'

type Element = {
  type: 'node' | 'way' | 'relation'
  id: number
  lat?: number
  lon?: number
  nodes?: number[]
  tags?: Record<string, string>
}
const data = JSON.parse(
  gunzipSync(readFileSync(join(ROOT, 'fixtures', `${scene}.json.gz`))).toString('utf8'),
) as { elements: Element[] }

const nodes = new Map<string, StreetEntity>()
const ways: StreetEntity[] = []
for (const e of data.elements) {
  if (e.type === 'node')
    nodes.set(`n${e.id}`, { id: `n${e.id}`, tags: e.tags ?? {}, loc: [e.lon!, e.lat!] })
  else if (e.type === 'way')
    ways.push({ id: `w${e.id}`, tags: e.tags ?? {}, nodes: (e.nodes ?? []).map((n) => `n${n}`) })
}

type Point = readonly number[]
const orient = (p: Point, q: Point, r: Point) =>
  Math.sign((q[0]! - p[0]!) * (r[1]! - p[1]!) - (q[1]! - p[1]!) * (r[0]! - p[0]!))

/** Where a closed ring crosses itself (proper crossings of two of its edges; touching does not count) */
export function selfCrossings(ring: readonly Point[]): [number, number][] {
  const found: [number, number][] = []
  const n = ring.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue
      const [a, b, c, d] = [ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!]
      if (orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0) {
        // the crossing point, for a link to the map
        const den = (b[0]! - a[0]!) * (d[1]! - c[1]!) - (b[1]! - a[1]!) * (d[0]! - c[0]!)
        const t = ((c[0]! - a[0]!) * (d[1]! - c[1]!) - (c[1]! - a[1]!) * (d[0]! - c[0]!)) / den
        found.push([
          Number((a[0]! + t * (b[0]! - a[0]!)).toFixed(7)),
          Number((a[1]! + t * (b[1]! - a[1]!)).toFixed(7)),
        ])
      }
    }
  }
  return found
}

const nodeOf = (id: string) => nodes.get(id)
const times: number[] = []
let result = streetOf(ways, nodeOf)
for (let r = 0; r < RUNS; r++) {
  const t0 = performance.now()
  result = streetOf(ways, nodeOf)
  times.push(performance.now() - t0)
}
times.sort((a, b) => a - b)
const { geometry } = result

const junctions = geometry.junctions
  .map((j) => ({
    nodeId: j.nodeId,
    ...(j.nodeIds ? { nodeIds: j.nodeIds } : {}),
    crossings: [j.ring, ...(j.holes ?? [])].flatMap((ring) => selfCrossings(ring)),
  }))
  .filter((j) => j.crossings.length > 0)
const lanes = geometry.lanes
  .map((l) => ({ wayId: l.wayId, laneId: l.laneId, crossings: selfCrossings(l.ring) }))
  .filter((l) => l.crossings.length > 0)

const report = {
  scene,
  counts: {
    junctions: geometry.junctions.length,
    junctionsCrossing: junctions.length,
    lanes: geometry.lanes.length,
    lanesCrossing: lanes.length,
    waysWithLanesCrossing: new Set(lanes.map((l) => l.wayId)).size,
  },
  drawMs: {
    runs: RUNS,
    median: Number(times[Math.floor(times.length / 2)]!.toFixed(1)),
    min: Number(times[0]!.toFixed(1)),
  },
  junctions,
  lanes,
}
const reports = join(ROOT, 'reports')
mkdirSync(reports, { recursive: true })
const file = join(
  reports,
  scene === 'dense' ? 'street-quality.json' : `street-quality-${scene}.json`,
)
writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `${scene}: ${report.counts.junctionsCrossing} of ${report.counts.junctions} junction outlines and ${report.counts.lanesCrossing} of ${report.counts.lanes} lane outlines cross themselves (${report.counts.waysWithLanesCrossing} ways); drawing ${report.drawMs.median} ms median of ${RUNS}`,
)
console.log(`wrote ${file}`)
