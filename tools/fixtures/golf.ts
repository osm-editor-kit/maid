/**
 * The made-up scene `golf`: a small course of three holes with everything Maid Golf shows and checks. Each hole has a
 * tee, a fairway, a green with its pin and the line of play; around them rough, bunkers, a pond and a stream, a cart path
 * and the clubhouse, and outside the course a street and a house that the golf filters lock. Some features carry the
 * mistakes the golf rules find (a bunker without natural=sand, a pond without natural=water, a hole without par and with a
 * generic name, sport=golf on a fairway), so the Issues dock and the scorecard have something to show.
 *
 * Not OSM data: written here, so it needs no extract and no person (core rule 1 is about OSM infrastructure).
 *
 * Usage: bun run fixtures-golf   (writes fixtures/golf.json.gz and fixtures/golf.meta.json)
 */
import { join } from 'node:path'
import { getScene } from './scenes'

type Tags = Record<string, string>
type Element =
  | { type: 'node'; id: number; lat: number; lon: number; version: number; tags?: Tags }
  | { type: 'way'; id: number; nodes: number[]; version: number; tags: Tags }

/** Metres east and north of the scene's south-west corner */
type Point = [number, number]

const round = (value: number) => Math.round(value * 1e7) / 1e7

function build() {
  const scene = getScene('golf')
  const [west, south] = scene.bbox
  const metresPerLat = 110_574
  const metresPerLon = 111_320 * Math.cos((south * Math.PI) / 180)
  const elements: Element[] = []
  let id = 2_000_000_000

  const node = ([x, y]: Point, tags?: Tags) => {
    const lat = round(south + y / metresPerLat)
    const lon = round(west + x / metresPerLon)
    elements.push({ type: 'node', id: ++id, lat, lon, version: 1, ...(tags ? { tags } : {}) })
    return id
  }
  const line = (points: Point[], tags: Tags) => {
    const nodes = points.map((point) => node(point))
    elements.push({ type: 'way', id: ++id, nodes, version: 1, tags })
    return id
  }
  /** A closed way: the first node again at the end */
  const area = (points: Point[], tags: Tags) => {
    const nodes = points.map((point) => node(point))
    elements.push({ type: 'way', id: ++id, nodes: [...nodes, nodes[0]!], version: 1, tags })
    return id
  }
  /** An ellipse of 12 corners, turned by `angle` degrees */
  const oval = ([cx, cy]: Point, rx: number, ry: number, angle = 0): Point[] => {
    const turn = (angle * Math.PI) / 180
    return Array.from({ length: 12 }, (_, i) => {
      const t = (i / 12) * 2 * Math.PI
      const x = rx * Math.cos(t)
      const y = ry * Math.sin(t)
      return [
        cx + x * Math.cos(turn) - y * Math.sin(turn),
        cy + x * Math.sin(turn) + y * Math.cos(turn),
      ]
    })
  }
  /** A box around a centre, `w` across and `h` along `angle` degrees */
  const box = ([cx, cy]: Point, w: number, h: number, angle = 0) =>
    oval([cx, cy], w / 2, h / 2, angle).filter((_, i) => i % 3 === 1)
  /** A band of `width` metres along a line: a fairway */
  const band = (points: Point[], width: number): Point[] => {
    const left: Point[] = []
    const right: Point[] = []
    points.forEach(([x, y], i) => {
      const [nx, ny] = points[Math.min(i + 1, points.length - 1)]!
      const [px, py] = points[Math.max(i - 1, 0)]!
      const dx = nx - px
      const dy = ny - py
      const length = Math.hypot(dx, dy) || 1
      const ox = (-dy / length) * (width / 2)
      const oy = (dx / length) * (width / 2)
      left.push([x + ox, y + oy])
      right.push([x - ox, y - oy])
    })
    return [...left, ...right.reverse()]
  }

  // the course, the clubhouse, the street and a house outside it
  area(
    [
      [60, 40],
      [760, 40],
      [760, 640],
      [60, 640],
    ],
    { leisure: 'golf_course', name: 'Maid Test Golf Club', sport: 'golf' },
  )
  area(box([130, 90], 40, 26), { building: 'yes', golf: 'clubhouse', name: 'Clubhouse' })
  line(
    [
      [0, 20],
      [800, 20],
    ],
    { highway: 'residential', name: 'Fairway Road' },
  )
  area(box([30, 90], 14, 12), { building: 'house' })
  line(
    [
      [150, 90],
      [180, 120],
      [190, 250],
      [330, 330],
      [420, 220],
      [600, 130],
    ],
    { highway: 'service', golf: 'cartpath', surface: 'asphalt' },
  )

  // hole 1: par 4 to the north, two bunkers by the green (one without natural=sand)
  const tee1: Point = [170, 140]
  const bend1: Point = [200, 300]
  const green1: Point = [240, 450]
  area(box(tee1, 18, 12, 80), { golf: 'tee', tee: 'white;yellow;red' })
  area(band([[175, 165], bend1, [235, 425]], 40), { golf: 'fairway' })
  area(oval(green1, 18, 14, 20), { golf: 'green' })
  area(oval([268, 440], 8, 5, 70), { golf: 'bunker', natural: 'sand' })
  area(oval([214, 462], 7, 5, 30), { golf: 'bunker' })
  area(oval([170, 330], 9, 6, 80), { golf: 'bunker', natural: 'sand', name: 'Bunker' })
  node([242, 452], { golf: 'pin', ref: '1' })
  line([tee1, bend1, green1], { golf: 'hole', ref: '1', par: '4', handicap: '5' })

  // hole 2: par 3 east over the pond (the pond without natural=water)
  const tee2: Point = [300, 520]
  const green2: Point = [450, 540]
  area(box(tee2, 16, 12, 10), { golf: 'tee', tee: 'white;yellow' })
  area(oval([375, 528], 34, 22), { golf: 'water_hazard' })
  area(oval(green2, 16, 14), { golf: 'green' })
  area(oval([455, 516], 8, 4), { golf: 'bunker', natural: 'sand' })
  node([452, 541], { golf: 'pin', ref: '2' })
  line([tee2, green2], { golf: 'hole', ref: '2', par: '3', handicap: '9' })

  // hole 3: par 5 back to the south, a stream along it; no par, a generic name and sport=golf on the fairway
  const tee3: Point = [520, 600]
  const bend3: Point = [600, 400]
  const green3: Point = [660, 140]
  area(box(tee3, 20, 12, 70), { golf: 'tee', tee: 'white' })
  area(band([[525, 575], bend3, [655, 165]], 46), { golf: 'fairway', sport: 'golf' })
  area(
    [
      [480, 560],
      [560, 380],
      [620, 120],
      [720, 110],
      [700, 420],
      [580, 620],
    ],
    { golf: 'rough' },
  )
  area(oval(green3, 20, 15, -10), { golf: 'green' })
  area(oval([690, 150], 9, 6, 10), { golf: 'bunker', natural: 'sand' })
  area(
    band(
      [
        [700, 600],
        [700, 450],
        [735, 300],
        [735, 200],
      ],
      8,
    ),
    { golf: 'lateral_water_hazard', natural: 'water' },
  )
  node([660, 142], { golf: 'pin', ref: '3' })
  line([tee3, bend3, green3], { golf: 'hole', ref: '3', handicap: '1', name: 'Hole 3' })

  // the driving range by the clubhouse
  area(
    [
      [80, 160],
      [140, 160],
      [140, 420],
      [80, 420],
    ],
    { golf: 'driving_range' },
  )
  return { scene, elements }
}

if (import.meta.main) {
  const { scene, elements } = build()
  // nodes first, then ways, as the OSM API answers
  elements.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type === 'node' ? -1 : 1))
  const counts = { node: 0, way: 0, relation: 0 }
  for (const element of elements) counts[element.type]++
  const json = JSON.stringify({ version: '0.6', generator: 'maid fixtures-golf', elements })
  const outDir = join(import.meta.dir, '../../fixtures')
  await Bun.write(join(outDir, 'golf.json.gz'), Bun.gzipSync(Buffer.from(json)))
  const meta = {
    name: scene.name,
    description: scene.description,
    bbox: scene.bbox,
    center: scene.center,
    zoom: scene.zoom,
    counts,
    source: { script: 'tools/fixtures/golf.ts' },
    attribution: 'Made up for the tests, not OSM data',
    sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'),
  }
  await Bun.write(join(outDir, 'golf.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  console.log(`golf: ${counts.node} nodes, ${counts.way} ways; wrote ${outDir}/golf.json.gz`)
}
