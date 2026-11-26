/**
 * The made-up scene `lanes`: one small road network per case of lane drawing, each in its own cell of a grid, so that
 * every case can be looked at, tested and talked about on its own: roads running on, lanes added and dropped, turn lanes,
 * junctions of every common shape, a roundabout, forks and merges, bus and cycle lanes, placement, ways drawn against
 * their traffic. Each way's `name` starts with the case's id (`L08 Main`), so the map says which case it is.
 *
 * Besides the scene for Maid's mock API it writes each case on its own in the fixture format of Lane Studio's geometry
 * tests (`test/spec/lanes/fixtures` in https://github.com/MarcelMarzec/LaneStudio: `nodes` by id with `loc` and `tags`,
 * `ways` as a list), and a catalogue with what each case shows, so the cases can be shared with other lane editors.
 *
 * Not OSM data: written here, so it needs no extract and no person (core rule 1 is about OSM infrastructure). Traffic
 * keeps right, as in Germany.
 *
 * Usage: bun run fixtures-lanes   (writes fixtures/lanes.json.gz, fixtures/lanes.meta.json and fixtures/lanes/)
 */
import { join } from 'node:path'
import { getScene } from './scenes'

type Tags = Record<string, string>
type Element =
  | { type: 'node'; id: number; lat: number; lon: number; version: number; tags?: Tags }
  | { type: 'way'; id: number; nodes: number[]; version: number; tags: Tags }

/** Metres east and north of the cell's middle */
type Point = [number, number]

export type LaneCase = {
  id: string
  title: string
  /** What the case shows and what a good drawing does with it */
  shows: string
  /** Draws the case; `way` makes a way through the points, nodes at the same point are shared */
  draw: (
    way: (points: Point[], tags: Tags) => void,
    node: (point: Point, tags: Tags) => void,
  ) => void
}

const twoByTwo = { lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' }

export const CASES: LaneCase[] = [
  {
    id: 'L01',
    title: 'Straight on',
    shows:
      'Two ways of the same road in a line, two lanes each way: the lanes meet edge to edge, no step, no gap.',
    draw: (way) => {
      const tags = { highway: 'primary', name: 'L01 Straight', ...twoByTwo }
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        tags,
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        tags,
      )
    },
  },
  {
    id: 'L02',
    title: 'A bend between two ways',
    shows:
      'The road bends by 45° at the node where two ways meet: both are cut on the bisector of the bend.',
    draw: (way) => {
      const tags = { highway: 'secondary', name: 'L02 Bend', lanes: '2' }
      way(
        [
          [-140, -60],
          [0, 0],
        ],
        tags,
      )
      way(
        [
          [0, 0],
          [90, 90],
        ],
        tags,
      )
    },
  },
  {
    id: 'L03',
    title: 'A sharp bend',
    shows: 'A bend of 135° between two ways: the inner edges must not throw a spike.',
    draw: (way) => {
      const tags = { highway: 'tertiary', name: 'L03 Sharp bend', lanes: '2' }
      way(
        [
          [-120, -40],
          [0, 0],
        ],
        tags,
      )
      way(
        [
          [0, 0],
          [-120, 40],
        ],
        tags,
      )
    },
  },
  {
    id: 'L04',
    title: 'A right-turn lane added',
    shows:
      'A one-way road of two lanes gets a third lane on the right before a junction (turn:lanes=through|through|right): the new lane widens out from the kerb over about 25 m, the through lanes run straight.',
    draw: (way) => {
      const road = { highway: 'primary', name: 'L04 Main', oneway: 'yes' }
      way(
        [
          [-140, 0],
          [-40, 0],
        ],
        { ...road, lanes: '2', 'turn:lanes': 'through|through' },
      )
      way(
        [
          [-40, 0],
          [60, 0],
        ],
        { ...road, lanes: '3', 'turn:lanes': 'through|through|right' },
      )
      way(
        [
          [60, 0],
          [140, 0],
        ],
        { ...road, lanes: '2' },
      )
      way(
        [
          [60, 0],
          [60, -120],
        ],
        { highway: 'residential', name: 'L04 Side' },
      )
    },
  },
  {
    id: 'L05',
    title: 'A left-turn lane in the middle',
    shows:
      'A two-way road of one lane each way gets a left-turn lane in its middle before a junction (lanes:forward=2, turn:lanes:forward=left|through): the new lane opens between the two directions, the through lane stays at the kerb.',
    draw: (way) => {
      const road = { highway: 'secondary', name: 'L05 Main' }
      way(
        [
          [-140, 0],
          [-40, 0],
        ],
        { ...road, lanes: '2' },
      )
      way(
        [
          [-40, 0],
          [60, 0],
        ],
        {
          ...road,
          lanes: '3',
          'lanes:forward': '2',
          'lanes:backward': '1',
          'turn:lanes:forward': 'left|through',
        },
      )
      way(
        [
          [60, 0],
          [140, 0],
        ],
        { ...road, lanes: '2' },
      )
      way(
        [
          [60, 0],
          [60, 120],
        ],
        { highway: 'residential', name: 'L05 Side' },
      )
    },
  },
  {
    id: 'L06',
    title: 'Four lanes become two',
    shows:
      'A two-way road of two lanes each way goes on with one lane each way: the outer lanes narrow to nothing.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { highway: 'primary', name: 'L06 Road', ...twoByTwo },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'primary', name: 'L06 Road', lanes: '2' },
      )
    },
  },
  {
    id: 'L07',
    title: 'An unmarked road meets a marked one',
    shows:
      'A residential street without lane markings (width=8) goes on as a road with one lane each way (6 m): the kerbs ease from one width to the other, nothing narrows to a point.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { highway: 'residential', name: 'L07 Street', width: '8', lane_markings: 'no' },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'tertiary', name: 'L07 Street', lanes: '2' },
      )
    },
  },
  {
    id: 'L08',
    title: 'T-junction',
    shows:
      'A side street joins a main road of two lanes each way: the main road runs through, the side street stops at its kerb, the junction is filled, the main road’s kerb opens for the side street.',
    draw: (way) => {
      const main = { highway: 'primary', name: 'L08 Main', ...twoByTwo }
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        main,
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        main,
      )
      way(
        [
          [0, 0],
          [0, -130],
        ],
        { highway: 'residential', name: 'L08 Side' },
      )
    },
  },
  {
    id: 'L09',
    title: 'Crossroads with turn lanes',
    shows:
      'A main road with a left-turn lane on each approach crosses a road of one lane each way: the main road runs through, the cross road stops at its kerbs, the turn arrows sit before the junction.',
    draw: (way) => {
      const main = { highway: 'primary', name: 'L09 Main', lanes: '3' }
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        {
          ...main,
          'lanes:forward': '2',
          'lanes:backward': '1',
          'turn:lanes:forward': 'left|through;right',
        },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        {
          ...main,
          'lanes:forward': '1',
          'lanes:backward': '2',
          'turn:lanes:backward': 'left|through;right',
        },
      )
      const cross = { highway: 'secondary', name: 'L09 Cross', lanes: '2' }
      way(
        [
          [0, -130],
          [0, 0],
        ],
        cross,
      )
      way(
        [
          [0, 0],
          [0, 130],
        ],
        cross,
      )
    },
  },
  {
    id: 'L10',
    title: 'A skewed crossing',
    shows:
      'Two roads cross at 60°, each one way through the node: the junction is a rhombus, the kerb curves at the sharp corners stay inside it.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
          [140, 0],
        ],
        { highway: 'tertiary', name: 'L10 Long', lanes: '2' },
      )
      way(
        [
          [-70, -121],
          [0, 0],
          [70, 121],
        ],
        { highway: 'residential', name: 'L10 Skew' },
      )
    },
  },
  {
    id: 'L11',
    title: 'A road splits into a dual carriageway',
    shows:
      'A two-way road of two lanes each way splits into two one-way roads (traffic keeps right: the eastbound one to the south): no road runs through, the junction joins all three, each carriageway takes the lanes of its direction.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { highway: 'primary', name: 'L11 Road', ...twoByTwo },
      )
      const carriageway = { highway: 'primary', name: 'L11 Road', oneway: 'yes', lanes: '2' }
      way(
        [
          [0, 0],
          [60, -14],
          [140, -14],
        ],
        carriageway,
      )
      way(
        [
          [140, 14],
          [60, 14],
          [0, 0],
        ],
        carriageway,
      )
    },
  },
  {
    id: 'L12',
    title: 'A dual carriageway crossed by a road',
    shows:
      'A road crosses both carriageways of a dual carriageway; the piece between them is 24 m long: two junctions close together, which a good drawing shows as one.',
    draw: (way) => {
      const carriageway = { highway: 'primary', name: 'L12 Avenue', oneway: 'yes', lanes: '2' }
      way(
        [
          [-140, -12],
          [0, -12],
          [140, -12],
        ],
        carriageway,
      )
      way(
        [
          [140, 12],
          [0, 12],
          [-140, 12],
        ],
        carriageway,
      )
      const cross = { highway: 'secondary', name: 'L12 Cross', lanes: '2' }
      way(
        [
          [0, -130],
          [0, -12],
        ],
        cross,
      )
      way(
        [
          [0, -12],
          [0, 12],
        ],
        cross,
      )
      way(
        [
          [0, 12],
          [0, 130],
        ],
        cross,
      )
    },
  },
  {
    id: 'L13',
    title: 'A roundabout',
    shows:
      'A ring of radius 30 m and two lanes with four roads of one lane each way: each road stops outside the ring, the ring runs on past them.',
    draw: (way) => {
      const ring: Point[] = Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * 2 * Math.PI
        return [30 * Math.cos(a), 30 * Math.sin(a)]
      })
      way([...ring, ring[0]!], {
        highway: 'primary',
        name: 'L13 Ring',
        junction: 'roundabout',
        lanes: '2',
      })
      for (const i of [0, 4, 8, 12]) {
        const [x, y] = ring[i]!
        way(
          [
            [x, y],
            [x * 4.3, y * 4.3],
          ],
          { highway: 'secondary', name: `L13 Arm ${i / 4 + 1}`, lanes: '2' },
        )
      }
    },
  },
  {
    id: 'L14',
    title: 'A bus lane ends',
    shows:
      'A road with a bus lane on the right of its eastbound direction (bus:lanes:forward=|designated) goes on without it: the bus lane narrows to nothing at the kerb.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        {
          highway: 'primary',
          name: 'L14 Road',
          lanes: '3',
          'lanes:forward': '2',
          'lanes:backward': '1',
          'bus:lanes:forward': '|designated',
        },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'primary', name: 'L14 Road', lanes: '2' },
      )
    },
  },
  {
    id: 'L15',
    title: 'A cycle lane between the lanes',
    shows:
      'The German pattern: a cycle lane between the through lane and the right-turn lane, in the lane keys but not in lanes (cycleway:lanes:forward=no|lane|no), before a junction with a side street; beyond the junction a plain road with cycle lanes on both sides (cycleway:both=lane).',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        {
          highway: 'secondary',
          name: 'L15 Road',
          lanes: '3',
          'lanes:forward': '2',
          'lanes:backward': '1',
          'turn:lanes:forward': 'through||right',
          'cycleway:lanes:forward': 'no|lane|no',
          'bicycle:lanes:forward': 'no|designated|yes',
          'vehicle:lanes:forward': 'yes|no|yes',
          'width:lanes:forward': '3.25|1.8|3',
          'cycleway:left': 'lane',
        },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        {
          highway: 'secondary',
          name: 'L15 Road',
          lanes: '2',
          'cycleway:both': 'lane',
        },
      )
      way(
        [
          [0, 0],
          [0, -120],
        ],
        { highway: 'residential', name: 'L15 Side' },
      )
    },
  },
  {
    id: 'L16',
    title: 'The way line moves within the road',
    shows:
      'A one-way road of two lanes is mapped along the left edge of its first lane (placement=left_of:1), and goes on mapped along its middle: the lanes stay where they are, only the way line moves.',
    draw: (way) => {
      const road = { highway: 'primary', name: 'L16 Road', oneway: 'yes', lanes: '2' }
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { ...road, placement: 'left_of:1' },
      )
      way(
        [
          [0, 0],
          [140, -3.5],
        ],
        road,
      )
    },
  },
  {
    id: 'L17',
    title: 'A one-way road drawn against its traffic',
    shows:
      'A one-way road of two lanes goes on as a way drawn the other way round (oneway=-1): the lanes and turn arrows carry on as if it were drawn along the traffic.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        {
          highway: 'secondary',
          name: 'L17 Road',
          oneway: 'yes',
          lanes: '2',
          'turn:lanes': 'through|through',
        },
      )
      way(
        [
          [140, 0],
          [0, 0],
        ],
        {
          highway: 'secondary',
          name: 'L17 Road',
          oneway: '-1',
          lanes: '2',
          'turn:lanes': 'left|through',
        },
      )
    },
  },
  {
    id: 'L18',
    title: 'Staggered junction',
    shows:
      'Two side streets join a main road from opposite sides 16 m apart: two junctions close together, the main road runs through both.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [-8, 0],
          [8, 0],
          [140, 0],
        ],
        { highway: 'primary', name: 'L18 Main', ...twoByTwo },
      )
      way(
        [
          [-8, 0],
          [-8, 120],
        ],
        { highway: 'residential', name: 'L18 North' },
      )
      way(
        [
          [8, 0],
          [8, -120],
        ],
        { highway: 'residential', name: 'L18 South' },
      )
    },
  },
  {
    id: 'L19',
    title: 'A slip road leaves',
    shows:
      'A one-way road of three lanes loses its right lane to a slip road (highway=primary_link) leaving at a shallow angle: the slip road should start where the right lane is.',
    draw: (way) => {
      const road = { highway: 'primary', name: 'L19 Road', oneway: 'yes' }
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { ...road, lanes: '3', 'turn:lanes': 'through|through|slight_right' },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { ...road, lanes: '2' },
      )
      way(
        [
          [0, 0],
          [70, -14],
          [140, -45],
        ],
        { highway: 'primary_link', name: 'L19 Slip', oneway: 'yes', lanes: '1' },
      )
    },
  },
  {
    id: 'L20',
    title: 'Two roads merge',
    shows:
      'Two one-way roads of one lane each join into a one-way road of two lanes: each lane runs on into its side of the joined road.',
    draw: (way) => {
      const branch = { highway: 'secondary', name: 'L20 Branch', oneway: 'yes', lanes: '1' }
      way(
        [
          [-140, 40],
          [-60, 10],
          [0, 0],
        ],
        branch,
      )
      way(
        [
          [-140, -40],
          [-60, -10],
          [0, 0],
        ],
        branch,
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'secondary', name: 'L20 Joined', oneway: 'yes', lanes: '2' },
      )
    },
  },
  {
    id: 'L21',
    title: 'Small streets without lane tags',
    shows:
      'A residential street, a living street and a service road without any lane tags meet: each is drawn as one shared carriageway of an assumed width, muted, joined at the junction.',
    draw: (way, node) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        { highway: 'residential', name: 'L21 Residential' },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'living_street', name: 'L21 Living street' },
      )
      way(
        [
          [0, 0],
          [0, -110],
        ],
        { highway: 'service', name: 'L21 Service' },
      )
      node([140, 0], { highway: 'turning_circle' })
    },
  },
  {
    id: 'L22',
    title: 'Widths per lane',
    shows:
      'A road of one wide lane and one narrow lane each way (width:lanes) goes on with equal lanes: every lane eases to its new width, the centre line stays straight.',
    draw: (way) => {
      way(
        [
          [-140, 0],
          [0, 0],
        ],
        {
          highway: 'secondary',
          name: 'L22 Road',
          ...twoByTwo,
          'width:lanes:forward': '3.5|2.75',
          'width:lanes:backward': '2.75|3.5',
        },
      )
      way(
        [
          [0, 0],
          [140, 0],
        ],
        { highway: 'secondary', name: 'L22 Road', ...twoByTwo },
      )
    },
  },
]

/**
 * Real places of the `dense` scene (Neukölln, cut from an extract of 2026-08-06, OSM data under the ODbL) that show the
 * same questions on real mapping. Each is written as a case file of the lane roads within `radius` metres, so another
 * editor can draw the very same data, and with a link to open the place there on today's data.
 */
export type LanePlace = { id: string; title: string; shows: string; lat: number; lon: number; radius: number }

export const PLACES: LanePlace[] = [
  {
    id: 'P01',
    title: 'Karl-Marx-Straße at Rathaus Neukölln',
    shows: 'Turn lanes, a cycle lane between the lanes (German pattern), placement, side streets and a dual carriageway nearby.',
    lat: 52.48057,
    lon: 13.43568,
    radius: 120,
  },
  {
    id: 'P02',
    title: 'Hermannplatz',
    shows: 'A large junction of many nodes, bus lanes running into it, roads splitting into one-way carriageways.',
    lat: 52.4868,
    lon: 13.4248,
    radius: 130,
  },
  {
    id: 'P03',
    title: 'Karl-Marx-Straße at Werbellinstraße',
    shows: 'Turn lanes in both directions, a two-way road splitting into two one-way roads, cycle lanes.',
    lat: 52.48,
    lon: 13.4365,
    radius: 120,
  },
  {
    id: 'P04',
    title: 'Sonnenallee with bus lanes',
    shows: 'psv:lanes on a main road, side streets without lane tags.',
    lat: 52.4803,
    lon: 13.4429,
    radius: 120,
  },
  {
    id: 'P05',
    title: 'Hasenheide slip roads',
    shows: 'secondary_link slip roads leaving and joining a main road.',
    lat: 52.48718,
    lon: 13.42154,
    radius: 120,
  },
  {
    id: 'P06',
    title: 'Werbellinstraße links',
    shows: 'tertiary_link ways at a junction of three roads.',
    lat: 52.4778,
    lon: 13.4285,
    radius: 120,
  },
  {
    id: 'P07',
    title: 'A wide unmarked street meets a marked one',
    shows: 'A residential carriageway tagged with its width goes on as a road with lanes and a cycle lane.',
    lat: 52.48148,
    lon: 13.43738,
    radius: 100,
  },
  {
    id: 'P08',
    title: 'Flughafenstraße and Columbiadamm',
    shows: 'Ways mapped off the middle of the road (placement), a junction of main roads.',
    lat: 52.4804,
    lon: 13.4215,
    radius: 120,
  },
]

const LANE_ROADS = new Set([
  'motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link',
  'tertiary', 'tertiary_link', 'unclassified', 'road', 'busway', 'residential', 'living_street', 'service',
])

/** The lane roads of the dense fixture near a place, with all their nodes, as a case file */
function placeFile(
  dense: { elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Tags }[] },
  place: LanePlace,
) {
  const nodes = new Map<number, { lat: number; lon: number; tags?: Tags }>()
  for (const e of dense.elements) if (e.type === 'node') nodes.set(e.id, { lat: e.lat!, lon: e.lon!, ...(e.tags ? { tags: e.tags } : {}) })
  const kx = 111_320 * Math.cos((place.lat * Math.PI) / 180)
  const near = (id: number) => {
    const n = nodes.get(id)
    return n !== undefined && Math.hypot((n.lon - place.lon) * kx, (n.lat - place.lat) * 111_320) <= place.radius
  }
  const ways = dense.elements.filter(
    (e) => e.type === 'way' && LANE_ROADS.has(e.tags?.highway ?? '') && e.tags?.area !== 'yes' && e.nodes!.some(near),
  )
  const used = [...new Set(ways.flatMap((w) => w.nodes!))].filter((id) => nodes.has(id))
  return {
    nodes: Object.fromEntries(
      used.map((id) => {
        const n = nodes.get(id)!
        return [`n${id}`, { loc: [n.lon, n.lat], tags: n.tags ?? {} }]
      }),
    ),
    ways: ways.map((w) => ({ id: `w${w.id}`, nodes: w.nodes!.filter((id) => nodes.has(id)).map((id) => `n${id}`), tags: w.tags ?? {} })),
  }
}

/** Cells of 300 m in rows of five, from the north-west */
const CELL = 300
const COLUMNS = 5

const round = (value: number) => Math.round(value * 1e7) / 1e7

export function build() {
  const scene = getScene('lanes')
  const [west, , , north] = scene.bbox
  const metresPerLat = 111_320
  const metresPerLon = 111_320 * Math.cos((north * Math.PI) / 180)
  const elements: Element[] = []
  const perCase = new Map<
    string,
    { nodes: Map<number, Element & { type: 'node' }>; ways: (Element & { type: 'way' })[] }
  >()
  let id = 3_000_000_000

  CASES.forEach((laneCase, index) => {
    const cx = (index % COLUMNS) * CELL + CELL / 2
    const cy = -(Math.floor(index / COLUMNS) * CELL + CELL / 2)
    const nodes = new Map<string, number>()
    const own = {
      nodes: new Map<number, Element & { type: 'node' }>(),
      ways: [] as (Element & { type: 'way' })[],
    }
    perCase.set(laneCase.id, own)
    const nodeAt = ([x, y]: Point, tags?: Tags) => {
      const key = `${Math.round(x * 100)}:${Math.round(y * 100)}`
      const known = nodes.get(key)
      if (known !== undefined) {
        if (tags) {
          const element = own.nodes.get(known)!
          element.tags = { ...element.tags, ...tags }
        }
        return known
      }
      const element = {
        type: 'node' as const,
        id: ++id,
        lat: round(north + (cy + y) / metresPerLat),
        lon: round(west + (cx + x) / metresPerLon),
        version: 1,
        ...(tags ? { tags } : {}),
      }
      elements.push(element)
      own.nodes.set(id, element)
      nodes.set(key, id)
      return id
    }
    laneCase.draw(
      (points, tags) => {
        const element = {
          type: 'way' as const,
          id: ++id,
          nodes: points.map((p) => nodeAt(p)),
          version: 1,
          tags,
        }
        elements.push(element)
        own.ways.push(element)
      },
      (point, tags) => {
        nodeAt(point, tags)
      },
    )
  })
  return { scene, elements, perCase }
}

if (import.meta.main) {
  const { scene, elements, perCase } = build()
  elements.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type === 'node' ? -1 : 1))
  const counts = { node: 0, way: 0, relation: 0 }
  for (const element of elements) counts[element.type]++
  const json = JSON.stringify({ version: '0.6', generator: 'maid fixtures-lanes', elements })
  const outDir = join(import.meta.dir, '../../fixtures')
  await Bun.write(join(outDir, 'lanes.json.gz'), Bun.gzipSync(Buffer.from(json)))
  const meta = {
    name: scene.name,
    description: scene.description,
    bbox: scene.bbox,
    center: scene.center,
    zoom: scene.zoom,
    counts,
    source: { script: 'tools/fixtures/lanes.ts' },
    attribution: 'Made up for the tests, not OSM data',
    sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'),
  }
  await Bun.write(join(outDir, 'lanes.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)

  // each case in the fixture format of Lane Studio's geometry tests, and the catalogue
  const catalogue = []
  for (const laneCase of CASES) {
    const own = perCase.get(laneCase.id)!
    const lats = [...own.nodes.values()].map((n) => n.lat)
    const lons = [...own.nodes.values()].map((n) => n.lon)
    const centre = [
      round((Math.min(...lons) + Math.max(...lons)) / 2),
      round((Math.min(...lats) + Math.max(...lats)) / 2),
    ]
    const file = {
      nodes: Object.fromEntries(
        [...own.nodes.values()].map((n) => [
          `n${n.id}`,
          { loc: [n.lon, n.lat], tags: n.tags ?? {} },
        ]),
      ),
      ways: own.ways.map((w) => ({
        id: `w${w.id}`,
        nodes: w.nodes.map((n) => `n${n}`),
        tags: w.tags,
      })),
    }
    const name = `${laneCase.id.toLowerCase()}.json`
    await Bun.write(join(outDir, 'lanes', 'cases', name), `${JSON.stringify(file, null, 1)}\n`)
    catalogue.push({
      id: laneCase.id,
      title: laneCase.title,
      shows: laneCase.shows,
      file: `cases/${name}`,
      centre,
    })
  }
  await Bun.write(join(outDir, 'lanes', 'cases.json'), `${JSON.stringify(catalogue, null, 2)}\n`)

  // the real places, cut from the committed dense fixture (no download, no OSM server)
  const dense = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(await Bun.file(join(outDir, 'dense.json.gz')).bytes())))
  const places = []
  for (const place of PLACES) {
    const name = `${place.id.toLowerCase()}.json`
    await Bun.write(join(outDir, 'lanes', 'places', name), `${JSON.stringify(placeFile(dense, place), null, 1)}\n`)
    const map = `19/${place.lat}/${place.lon}`
    places.push({
      id: place.id,
      title: place.title,
      shows: place.shows,
      file: `places/${name}`,
      centre: [place.lon, place.lat],
      attribution: '© OpenStreetMap contributors, ODbL 1.0 (fixtures/dense, extract of 2026-08-06)',
      links: {
        maid: `?scene=dense#map=${map}`,
        openStreetMap: `https://www.openstreetmap.org/#map=${map}`,
        laneStudio: `https://lanestudio.marcelmarzec.com/editor/#map=${map}`,
      },
    })
  }
  await Bun.write(join(outDir, 'lanes', 'places.json'), `${JSON.stringify(places, null, 2)}\n`)
  console.log(
    `lanes: ${CASES.length} cases, ${counts.node} nodes, ${counts.way} ways; wrote ${outDir}/lanes.json.gz and ${outDir}/lanes/`,
  )
}
