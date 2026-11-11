/**
 * The made-up scene `bicycle`: one short way per case of bicycle infrastructure, so that every TILDA category and the
 * subcategories a mapper chooses can be looked at side by side. Paths (the way itself is the infrastructure) are on the
 * left, roads with their sides tagged on them on the right; each way's `name` says what it is, so it shows on the map.
 * The tags follow the fixtures of TILDA's category schema (tilda-schemas, `schemas/bicycle-infrastructure-category`).
 *
 * Not OSM data: written here, so it needs no extract and no person (core rule 1 is about OSM infrastructure). The script
 * checks each case against TILDA's processing and fails when a case does not give its category.
 *
 * Usage: bun run fixtures-bicycle   (writes fixtures/bicycle.json.gz and fixtures/bicycle.meta.json)
 */
import { join } from 'node:path'
import { tildaCategories } from '../../packages/module-bike-infrastructure/src/features.ts'
import { getScene } from './scenes'

export type Case = {
  name: string
  tags: Record<string, string>
  /** The categories TILDA gives, as `side:category`, in its order */
  expect: string[]
}

export const PATHS: Case[] = [
  { name: 'cycleway (bare)', tags: { highway: 'cycleway' }, expect: ['self:needsClarification'] },
  {
    name: 'cycleway DE:237',
    tags: { highway: 'cycleway', traffic_sign: 'DE:237' },
    expect: ['self:cycleway_adjoiningOrIsolated'],
  },
  {
    name: 'cycleway is_sidepath=yes',
    tags: { highway: 'cycleway', traffic_sign: 'DE:237', is_sidepath: 'yes' },
    expect: ['self:cycleway_adjoining'],
  },
  {
    name: 'cycleway is_sidepath=no',
    tags: { highway: 'cycleway', traffic_sign: 'DE:237', is_sidepath: 'no' },
    expect: ['self:cycleway_isolated'],
  },
  {
    name: 'protected (bollard)',
    tags: { highway: 'cycleway', is_sidepath: 'yes', 'separation:left': 'bollard' },
    expect: ['self:cyclewayOnHighwayProtected'],
  },
  {
    name: 'lane (separate way)',
    tags: { highway: 'cycleway', cycleway: 'lane' },
    expect: ['self:cyclewayOnHighway_advisoryOrExclusive'],
  },
  {
    name: 'lane exclusive',
    tags: {
      highway: 'cycleway',
      cycleway: 'lane',
      'cycleway:lane': 'exclusive',
      traffic_sign: 'DE:237',
    },
    expect: ['self:cyclewayOnHighway_exclusive'],
  },
  {
    name: 'lane advisory',
    tags: { highway: 'cycleway', cycleway: 'lane', 'cycleway:lane': 'advisory' },
    expect: ['self:cyclewayOnHighway_advisory'],
  },
  {
    name: 'shared lane (sharrows)',
    tags: { highway: 'cycleway', cycleway: 'shared_lane' },
    expect: ['self:sharedMotorVehicleLane'],
  },
  {
    name: 'cycleway link',
    tags: { highway: 'cycleway', cycleway: 'link' },
    expect: ['self:cyclewayLink'],
  },
  {
    name: 'cycleway crossing',
    tags: { highway: 'cycleway', cycleway: 'crossing' },
    expect: ['self:crossing'],
  },
  {
    name: 'shared DE:240',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'no',
      traffic_sign: 'DE:240',
    },
    expect: ['self:footAndCyclewayShared_adjoiningOrIsolated'],
  },
  {
    name: 'shared is_sidepath=yes',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'no',
      is_sidepath: 'yes',
    },
    expect: ['self:footAndCyclewayShared_adjoining'],
  },
  {
    name: 'shared is_sidepath=no',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'no',
      is_sidepath: 'no',
    },
    expect: ['self:footAndCyclewayShared_isolated'],
  },
  {
    name: 'segregated DE:241',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'yes',
      traffic_sign: 'DE:241-30',
    },
    expect: ['self:footAndCyclewaySegregated_adjoiningOrIsolated'],
  },
  {
    name: 'segregated is_sidepath=yes',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'yes',
      is_sidepath: 'yes',
    },
    expect: ['self:footAndCyclewaySegregated_adjoining'],
  },
  {
    name: 'segregated is_sidepath=no',
    tags: {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'yes',
      is_sidepath: 'no',
    },
    expect: ['self:footAndCyclewaySegregated_isolated'],
  },
  {
    name: 'footway bicycle=yes',
    tags: { highway: 'footway', bicycle: 'yes' },
    expect: ['self:footwayBicycleYes_adjoiningOrIsolated'],
  },
  {
    name: 'sidewalk bicycle=yes DE:239,1022-10',
    tags: {
      highway: 'footway',
      footway: 'sidewalk',
      bicycle: 'yes',
      traffic_sign: 'DE:239,1022-10',
    },
    expect: ['self:footwayBicycleYes_adjoining'],
  },
  {
    name: 'footway bicycle=yes is_sidepath=no',
    tags: { highway: 'footway', bicycle: 'yes', is_sidepath: 'no' },
    expect: ['self:footwayBicycleYes_isolated'],
  },
  {
    name: 'pedestrian bicycle=yes',
    tags: { highway: 'pedestrian', bicycle: 'yes' },
    expect: ['self:pedestrianAreaBicycleYes'],
  },
  {
    name: 'bicycle road DE:244.1',
    tags: { highway: 'residential', bicycle_road: 'yes', traffic_sign: 'DE:244.1' },
    expect: ['self:bicycleRoad'],
  },
  {
    name: 'bicycle road, vehicles allowed',
    tags: {
      highway: 'residential',
      bicycle_road: 'yes',
      motor_vehicle: 'destination',
      traffic_sign: 'DE:244.1,1020-30',
    },
    expect: ['self:bicycleRoad_vehicleDestination'],
  },
  {
    name: 'cycleway under construction',
    tags: { highway: 'construction', construction: 'cycleway', is_sidepath: 'yes' },
    expect: ['self:cycleway_adjoining'],
  },
  {
    name: 'sidewalk (no bicycles)',
    tags: { highway: 'footway', footway: 'sidewalk' },
    expect: [],
  },
]

export const ROADS: Case[] = [
  {
    name: 'R exclusive lane right DE:237',
    tags: {
      highway: 'secondary',
      'cycleway:right': 'lane',
      'cycleway:right:lane': 'exclusive',
      'cycleway:right:traffic_sign': 'DE:237',
      'cycleway:left': 'no',
    },
    expect: ['left:data_no', 'right:cyclewayOnHighway_exclusive'],
  },
  {
    name: 'R advisory lanes both',
    tags: { highway: 'secondary', 'cycleway:both': 'lane', 'cycleway:both:lane': 'advisory' },
    expect: ['left:cyclewayOnHighway_advisory', 'right:cyclewayOnHighway_advisory'],
  },
  {
    name: 'R lane right, kind unknown',
    tags: { highway: 'secondary', 'cycleway:right': 'lane', 'cycleway:left': 'no' },
    expect: ['left:data_no', 'right:cyclewayOnHighway_advisoryOrExclusive'],
  },
  {
    name: 'R track right',
    tags: { highway: 'secondary', 'cycleway:right': 'track', 'cycleway:left': 'no' },
    expect: ['left:data_no', 'right:cycleway_adjoining'],
  },
  {
    name: 'R track left',
    tags: { highway: 'secondary', 'cycleway:left': 'track', 'cycleway:right': 'no' },
    expect: ['left:cycleway_adjoining', 'right:data_no'],
  },
  {
    name: 'R sidewalk right, bicycles allowed',
    tags: {
      highway: 'secondary',
      'cycleway:both': 'no',
      'sidewalk:right': 'yes',
      'sidewalk:right:bicycle': 'yes',
      'sidewalk:right:traffic_sign': 'DE:239,1022-10',
    },
    expect: ['left:data_no', 'right:data_no', 'right:footwayBicycleYes_adjoining'],
  },
  {
    name: 'R lane and sidewalk right',
    tags: {
      highway: 'secondary',
      'cycleway:right': 'lane',
      'cycleway:right:lane': 'advisory',
      'cycleway:left': 'no',
      'sidewalk:right': 'yes',
      'sidewalk:right:bicycle': 'yes',
    },
    expect: [
      'left:data_no',
      'right:cyclewayOnHighway_advisory',
      'right:footwayBicycleYes_adjoining',
    ],
  },
  {
    name: 'R protected lane right',
    tags: {
      highway: 'secondary',
      'cycleway:right': 'lane',
      'cycleway:right:lane': 'exclusive',
      'cycleway:right:separation:left': 'bollard',
      'cycleway:left': 'no',
    },
    expect: ['left:data_no', 'right:cyclewayOnHighwayProtected'],
  },
  {
    name: 'R shared lane right',
    tags: { highway: 'residential', 'cycleway:right': 'shared_lane', 'cycleway:left': 'no' },
    expect: ['left:data_no', 'right:sharedMotorVehicleLane'],
  },
  {
    name: 'R bus lane, bicycles allowed',
    tags: { highway: 'secondary', 'cycleway:right': 'share_busway', 'cycleway:left': 'no' },
    expect: ['left:data_no', 'right:sharedBusLaneBusWithBike'],
  },
  {
    name: 'R lane between car lanes',
    tags: { highway: 'secondary', 'cycleway:lanes': '|lane|' },
    expect: ['self:cyclewayOnHighwayBetweenLanes'],
  },
  {
    name: 'R cycleways mapped separately',
    tags: { highway: 'secondary', 'cycleway:both': 'separate' },
    expect: ['left:separate_geometry', 'right:separate_geometry'],
  },
  {
    name: 'R no cycleways',
    tags: { highway: 'secondary', 'cycleway:both': 'no' },
    expect: ['left:data_no', 'right:data_no'],
  },
  {
    name: 'R nothing tagged',
    tags: { highway: 'residential' },
    expect: [],
  },
]

type Element =
  | {
      type: 'node'
      id: number
      lat: number
      lon: number
      version: number
      tags?: Record<string, string>
    }
  | { type: 'way'; id: number; nodes: number[]; version: number; tags: Record<string, string> }

const round = (value: number) => Math.round(value * 1e7) / 1e7

/** The elements of a column of cases: each a way of three nodes from `west` to `east`, `step` degrees apart */
function column(cases: Case[], west: number, east: number, step: number, firstId: number) {
  const scene = getScene('bicycle')
  const north = scene.bbox[3] - 0.0002
  const elements: Element[] = []
  let id = firstId
  cases.forEach((item, row) => {
    const lat = round(north - row * step)
    const nodes = [west, (west + east) / 2, east].map((lon) => {
      elements.push({ type: 'node', id: ++id, lat, lon: round(lon), version: 1 })
      return id
    })
    elements.push({
      type: 'way',
      id: ++id,
      nodes,
      version: 1,
      tags: { ...item.tags, name: item.name },
    })
  })
  return { elements, last: id }
}

if (import.meta.main) {
  const failures: string[] = []
  for (const item of [...PATHS, ...ROADS]) {
    const got = tildaCategories(item.tags)
    if (JSON.stringify(got) !== JSON.stringify(item.expect))
      failures.push(
        `${item.name}: expected ${item.expect.join(' ') || '(none)'}, got ${got.join(' ') || '(none)'}`,
      )
  }
  if (failures.length > 0) {
    console.error(
      `fixtures-bicycle: ${failures.length} case(s) do not give their category:\n${failures.join('\n')}`,
    )
    process.exit(1)
  }
  const scene = getScene('bicycle')
  const paths = column(PATHS, 13.3005, 13.3017, 0.00017, 1_000_000_000)
  const roads = column(ROADS, 13.3033, 13.3053, 0.0003, paths.last)
  const elements = [...paths.elements, ...roads.elements]
  // nodes first, then ways, as the OSM API answers
  elements.sort((a, b) => (a.type === b.type ? a.id - b.id : a.type === 'node' ? -1 : 1))
  const counts = { node: 0, way: 0, relation: 0 }
  for (const element of elements) counts[element.type]++
  const json = JSON.stringify({ version: '0.6', generator: 'maid fixtures-bicycle', elements })
  const outDir = join(import.meta.dir, '../../fixtures')
  await Bun.write(join(outDir, 'bicycle.json.gz'), Bun.gzipSync(Buffer.from(json)))
  const meta = {
    name: scene.name,
    description: scene.description,
    bbox: scene.bbox,
    center: scene.center,
    zoom: scene.zoom,
    counts,
    source: { script: 'tools/fixtures/bicycle.ts' },
    attribution: 'Made up for the tests, not OSM data',
    sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'),
  }
  await Bun.write(join(outDir, 'bicycle.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  console.log(
    `bicycle: ${PATHS.length + ROADS.length} cases, ${counts.node} nodes, ${counts.way} ways; wrote ${outDir}/bicycle.json.gz`,
  )
}
