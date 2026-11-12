/**
 * The made-up scene `climbing`: a climbing area at the Kampenwand (Chiemgau) with what Maid Climbing works on. The places
 * are near the real rock, so the terrain's relief and 3D view have something to show, but the routes, names and grades
 * are invented.
 *
 * - The area "Kampenwand (made up)": a `type=site` relation with `climbing=area` whose members are the two crags.
 * - The crag "Ostgipfel": a `type=site` relation with `climbing=crag`; its routes are lines (`climbing=route`) from the
 *   foot of the rock to the top, the tags on the line, in member order from left to right.
 * - The crag "Südwand": the same, but its routes are start points (`climbing=route_bottom`, as OpenClimbing writes
 *   them), with French grades and a multi-pitch route.
 * - "Kleiner Block": a boulder crag as a point, with no routes.
 * - "Einsame Linie": a route that is in no crag, for "Add to a crag".
 * - Cliffs (`natural=cliff`) along the crags, and the path to them.
 *
 * Not OSM data: written here, so it needs no extract and no person (core rule 1 is about OSM infrastructure).
 *
 * Usage: bun run fixtures-climbing   (writes fixtures/climbing.json.gz and fixtures/climbing.meta.json)
 */
import { join } from 'node:path'
import { getScene } from './scenes'

type Tags = Record<string, string>
type Member = { type: 'node' | 'way' | 'relation'; ref: number; role: string }
type Element =
  | { type: 'node'; id: number; lat: number; lon: number; version: number; tags?: Tags }
  | { type: 'way'; id: number; nodes: number[]; version: number; tags: Tags }
  | { type: 'relation'; id: number; members: Member[]; version: number; tags: Tags }

const round = (value: number) => Math.round(value * 1e7) / 1e7

export type RouteCase = { name: string; tags: Tags }

/** The routes of the Ostgipfel, left to right: lines with their tags */
export const OSTGIPFEL: RouteCase[] = [
  {
    name: 'Morgengrat',
    tags: {
      'climbing:grade:uiaa': '4+',
      'climbing:length': '18',
      'climbing:bolts': '5',
      'climbing:sport': 'yes',
    },
  },
  {
    name: 'Dohlenriss',
    tags: { 'climbing:grade:uiaa': '5-', 'climbing:length': '22', 'climbing:trad': 'yes' },
  },
  {
    name: 'Gamsplatte',
    tags: {
      'climbing:grade:uiaa': '6',
      'climbing:grade:french': '5c',
      'climbing:length': '25',
      'climbing:bolts': '8',
      'climbing:sport': 'yes',
    },
  },
  {
    name: 'Wolkenkante',
    tags: {
      'climbing:grade:uiaa': '7+',
      'climbing:length': '28',
      'climbing:bolts': '10',
      'climbing:sport': 'yes',
    },
  },
  { name: 'Ohne Namen', tags: { 'climbing:length': '20' } },
]

/** The routes of the Südwand, left to right: start points with their tags, as OpenClimbing writes them */
export const SUEDWAND: RouteCase[] = [
  {
    name: 'Sonnenplatte',
    tags: {
      'climbing:grade:french': '5c',
      'climbing:length': '30',
      'climbing:bolts': '9',
      'climbing:sport': 'yes',
    },
  },
  {
    name: 'Chiemseeblick',
    tags: {
      'climbing:grade:french': '6a+',
      'climbing:length': '32',
      'climbing:bolts': '11',
      'climbing:sport': 'yes',
    },
  },
  {
    name: 'Lange Reise',
    tags: {
      'climbing:grade:french': '6b',
      'climbing:length': '95',
      'climbing:multipitch': 'yes',
      'climbing:pitches': '3',
      'climbing:sport': 'yes',
    },
  },
  {
    name: 'Schwarzer Pfeiler',
    tags: {
      'climbing:grade:french': '7a',
      'climbing:length': '35',
      'climbing:bolts': '14',
      'climbing:sport': 'yes',
    },
  },
]

if (import.meta.main) {
  const scene = getScene('climbing')
  const elements: Element[] = []
  let id = 2_000_000_000
  const node = (lon: number, lat: number, tags?: Tags) => {
    elements.push({
      type: 'node',
      id: ++id,
      lat: round(lat),
      lon: round(lon),
      version: 1,
      ...(tags ? { tags } : {}),
    })
    return id
  }
  const way = (nodes: number[], tags: Tags) => {
    elements.push({ type: 'way', id: ++id, nodes, version: 1, tags })
    return id
  }
  const relation = (members: Member[], tags: Tags) => {
    elements.push({ type: 'relation', id: ++id, members, version: 1, tags })
    return id
  }
  const climbing = { sport: 'climbing' }

  // Ostgipfel: the cliff from west to east, each route a line from its foot (south) up to the cliff
  const ostWest = 12.3618
  const ostTop = 47.75485
  const ostFoot = 47.75455
  const ostStep = 0.00022
  way(
    [
      node(ostWest - 0.0001, ostTop + 0.00002),
      node(ostWest + ostStep * 2, ostTop + 0.00004),
      node(ostWest + ostStep * 5, ostTop),
    ],
    { natural: 'cliff', name: 'Ostgipfel' },
  )
  const ostRoutes = OSTGIPFEL.map((route, index) => {
    const lon = ostWest + index * ostStep
    const foot = node(lon, ostFoot)
    const middle = node(lon + 0.00002, (ostFoot + ostTop) / 2)
    const top = node(lon + 0.00001, ostTop - 0.00001)
    return way([foot, middle, top], {
      ...climbing,
      climbing: 'route',
      name: route.name,
      ...route.tags,
    })
  })
  const ostCrag = relation(
    ostRoutes.map((ref) => ({ type: 'way', ref, role: '' })),
    {
      type: 'site',
      site: 'climbing',
      climbing: 'crag',
      ...climbing,
      name: 'Ostgipfel',
      'climbing:rock': 'limestone',
    },
  )

  // Südwand: start points along the foot of a second cliff further west
  const suedWest = 12.3572
  const suedFoot = 47.7537
  const suedStep = 0.00025
  way(
    [
      node(suedWest - 0.0001, suedFoot + 0.00006),
      node(suedWest + suedStep * 2, suedFoot + 0.00009),
      node(suedWest + suedStep * 4, suedFoot + 0.00005),
    ],
    { natural: 'cliff', name: 'Südwand' },
  )
  const suedRoutes = SUEDWAND.map((route, index) =>
    node(suedWest + index * suedStep, suedFoot, {
      ...climbing,
      climbing: 'route_bottom',
      name: route.name,
      ...route.tags,
    }),
  )
  const suedCrag = relation(
    suedRoutes.map((ref) => ({ type: 'node', ref, role: '' })),
    { type: 'site', site: 'climbing', climbing: 'crag', ...climbing, name: 'Südwand' },
  )

  relation(
    [
      { type: 'relation', ref: ostCrag, role: '' },
      { type: 'relation', ref: suedCrag, role: '' },
    ],
    { type: 'site', site: 'climbing', climbing: 'area', ...climbing, name: 'Kampenwand (made up)' },
  )

  // a boulder as a point crag, and a route in no crag yet, east of the Ostgipfel
  node(12.3652, 47.7541, {
    ...climbing,
    climbing: 'crag',
    'climbing:boulder': 'yes',
    name: 'Kleiner Block',
  })
  const lonely = ostWest + 6 * ostStep + 0.0002
  way([node(lonely, ostFoot - 0.00002), node(lonely + 0.00001, ostTop - 0.00003)], {
    ...climbing,
    climbing: 'route',
    name: 'Einsame Linie',
    'climbing:grade:uiaa': '5+',
    'climbing:length': '15',
  })

  // the path up from the south, past both crags
  way(
    [
      node(12.3555, 47.752),
      node(12.3568, 47.7533),
      node(12.3585, 47.7536),
      node(12.3605, 47.7543),
      node(12.3625, 47.7544),
      node(12.3655, 47.7546),
    ],
    { highway: 'path', name: 'Steig zur Kampenwand', sac_scale: 'mountain_hiking' },
  )

  // nodes first, then ways, then relations, as the OSM API answers
  const order = { node: 0, way: 1, relation: 2 }
  elements.sort((a, b) => (a.type === b.type ? a.id - b.id : order[a.type] - order[b.type]))
  const counts = { node: 0, way: 0, relation: 0 }
  for (const element of elements) counts[element.type]++
  const json = JSON.stringify({ version: '0.6', generator: 'maid fixtures-climbing', elements })
  const outDir = join(import.meta.dir, '../../fixtures')
  await Bun.write(join(outDir, 'climbing.json.gz'), Bun.gzipSync(Buffer.from(json)))
  const meta = {
    name: scene.name,
    description: scene.description,
    bbox: scene.bbox,
    center: scene.center,
    zoom: scene.zoom,
    counts,
    source: { script: 'tools/fixtures/climbing.ts' },
    attribution: 'Made up for the tests, not OSM data',
    sha256: new Bun.CryptoHasher('sha256').update(json).digest('hex'),
  }
  await Bun.write(join(outDir, 'climbing.meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  console.log(
    `climbing: ${counts.node} nodes, ${counts.way} ways, ${counts.relation} relations; wrote ${outDir}/climbing.json.gz`,
  )
}
