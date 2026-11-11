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
function graphOf(withFootway: boolean) {
  const entities = [node('n1', 13.4, 52.5), node('n2', 13.402, 52.5), way('w1', ['n1', 'n2'], road)]
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
