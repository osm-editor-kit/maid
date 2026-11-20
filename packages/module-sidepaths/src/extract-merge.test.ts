import { expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { extractMergePlan, extractPlan } from './extract-merge.ts'
import { projectOnLine } from './geometry.ts'

const context = new ModelContext()
const node = (id: string, lon: number, lat: number) => new OsmNode(context, { id, loc: [lon, lat] })
const way = (id: string, nodes: string[], tags: Record<string, string>) =>
  new OsmWay(context, { id, nodes, tags })
const north = (metres: number) => 52.5 + metres / 111_320

const road = {
  highway: 'residential',
  'cycleway:right': 'track',
  'cycleway:right:surface': 'asphalt',
  'sidewalk:right': 'yes',
  'sidewalk:left': 'no',
}

/** A road running east, and optionally a footway 5 m to its south (its right side) */
function graphOf(withFootway: boolean, roadTags: Record<string, string> = road) {
  const entities = [
    node('n1', 13.4, 52.5),
    node('n2', 13.402, 52.5),
    way('w1', ['n1', 'n2'], roadTags),
  ]
  if (withFootway)
    entities.push(
      node('n3', 13.4, north(-5)),
      node('n4', 13.402, north(-5)),
      way('w2', ['n3', 'n4'], {
        highway: 'footway',
        footway: 'sidewalk',
        surface: 'paving_stones',
      }),
    )
  return new Graph(new Graph(context, entities))
}

function apply(graph: Graph, plan: ReturnType<typeof extractPlan>) {
  if ('problem' in plan) throw new Error(plan.problem.reason)
  return plan.action(new Graph(graph))
}

test('extract the right cycle track: a new cycleway south of the road, the road side becomes separate', () => {
  const graph = graphOf(false)
  const plan = extractPlan(graph, 'w1', 'cycleway', ['right'], {})
  if ('problem' in plan) throw new Error(plan.problem.reason)
  const after = apply(graph, plan)
  const [id] = plan.selected
  const created = after.entity(id!) as OsmWay
  expect(created.tags.highway).toBe('cycleway')
  expect(created.tags.surface).toBe('asphalt')
  expect(after.entity('w1').tags['cycleway:right']).toBe('separate')
  // drawn on the right side, a few metres away, in the road's direction
  const [a, b] = created.nodes.map((n) => (after.entity(n) as OsmNode).loc as [number, number])
  const middle: [number, number] = [(a![0] + b![0]) / 2, (a![1] + b![1]) / 2]
  const projection = projectOnLine(middle, [
    [13.4, 52.5],
    [13.402, 52.5],
  ])
  expect(projection.side).toBe('right')
  expect(projection.distance).toBeGreaterThan(1)
  expect(projection.distance).toBeLessThan(10)
  // the copy the plan was tried on is not the graph
  expect(graph.hasEntity(id!)).toBeUndefined()
})

test('extract and merge: the footway (the older way) becomes the foot and cycle path, the extracted way is gone', () => {
  const graph = graphOf(true)
  const plan = extractMergePlan(graph, 'w1', ['right'], {})
  if ('problem' in plan) throw new Error(plan.problem.reason)
  expect(plan.selected).toEqual(['w2'])
  const after = apply(graph, plan)
  const path = after.entity('w2') as OsmWay
  expect(path.tags.bicycle).toBeDefined()
  expect(after.entity('w1').tags['cycleway:right']).toBe('separate')
  // only the road, the footway and their nodes are left of the ways
  const ways = [...after.local.entities.values()].filter((e) => e instanceof OsmWay)
  expect(ways.map((w) => w!.id).sort()).toEqual(['w1', 'w2'])
})

test('extract and merge without a footway is refused before anything changes', () => {
  expect(extractMergePlan(graphOf(false), 'w1', ['right'], {})).toEqual({
    problem: { reason: 'no_sidewalk', side: 'right', step: 'merge' },
  })
})

// iD-Radnetz, 2026-11-20 (TILDA tagging 0.7.0): a cycle track segregated from the sidewalk
const segregatedRoad = { ...road, 'cycleway:both:segregated': 'yes' }

test('a segregated cycle track is merged with the sidewalk into a segregated foot and cycle path', () => {
  const graph = graphOf(true, segregatedRoad)
  const plan = extractMergePlan(graph, 'w1', ['right'], {})
  if ('problem' in plan) throw new Error(plan.problem.reason)
  expect(plan.selected).toEqual(['w2'])
  expect(plan.keptApart).toEqual([])
  const path = apply(graph, plan).entity('w2') as OsmWay
  expect(path.tags).toMatchObject({ highway: 'path', foot: 'designated', segregated: 'yes' })
  expect(path.tags['traffic_mode:right']).toBeUndefined()
})

test('a segregated cycle track without a sidewalk way becomes a segregated path of its own, not a refusal', () => {
  const graph = graphOf(false, segregatedRoad)
  const plan = extractMergePlan(graph, 'w1', ['right'], {})
  if ('problem' in plan) throw new Error(plan.problem.reason)
  expect(plan.keptApart).toEqual([{ side: 'right', outcome: 'alone' }])
  const created = apply(graph, plan).entity(plan.selected[0]!) as OsmWay
  expect(created.tags).toMatchObject({ highway: 'path', foot: 'designated', segregated: 'yes' })
})

test('a segregated cycle track of a road under construction stays apart from a sidewalk that is not: two lines', () => {
  const building = { ...segregatedRoad, highway: 'construction', construction: 'residential' }
  const graph = graphOf(true, building)
  const plan = extractMergePlan(graph, 'w1', ['right'], {})
  if ('problem' in plan) throw new Error(plan.problem.reason)
  expect(plan.keptApart).toEqual([{ side: 'right', outcome: 'two_lines' }])
  const after = apply(graph, plan)
  const created = after.entity(plan.selected[0]!) as OsmWay
  expect(created.tags).toMatchObject({
    highway: 'construction',
    construction: 'cycleway',
    'traffic_mode:right': 'foot',
  })
  expect(after.entity('w2').tags.highway).toBe('footway')
})

test('a plain cycle track of a road under construction is not merged with a sidewalk that is not', () => {
  const graph = graphOf(true, { ...road, highway: 'construction', construction: 'residential' })
  const plan = extractMergePlan(graph, 'w1', ['right'], {})
  expect('problem' in plan && plan.problem.reason).toBe('different_lifecycle')
})
