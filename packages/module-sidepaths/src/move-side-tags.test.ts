import { expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { separateWays } from './find.ts'
import { moveApplies, moveSideTagsPlan } from './move-side-tags.ts'

const context = new ModelContext()
const node = (id: string, lon: number, lat: number) => new OsmNode(context, { id, loc: [lon, lat] })
const way = (id: string, nodes: string[], tags: Record<string, string>) =>
  new OsmWay(context, { id, nodes, tags })

/** Metres north of the road, in degrees */
const north = (metres: number) => 52.5 + metres / 111_320

/** A road running east, a sidewalk 6 m to its north (left), one 6 m to its south (right) drawn westwards, a crossing footway */
function graphOf(
  roadTags: Record<string, string>,
  leftTags: Record<string, string> = { highway: 'footway', footway: 'sidewalk' },
) {
  return new Graph(context, [
    node('n1', 13.4, 52.5),
    node('n2', 13.402, 52.5),
    node('n3', 13.4, north(6)),
    node('n4', 13.402, north(6)),
    node('n5', 13.402, north(-6)),
    node('n6', 13.4, north(-6)),
    node('n7', 13.401, north(-20)),
    node('n8', 13.401, north(20)),
    way('w1', ['n1', 'n2'], roadTags),
    way('w2', ['n3', 'n4'], leftTags),
    way('w3', ['n5', 'n6'], { highway: 'footway', footway: 'sidewalk' }),
    way('w4', ['n7', 'n8'], { highway: 'footway', footway: 'crossing' }),
  ])
}

const road = {
  highway: 'residential',
  'sidewalk:both': 'separate',
  'sidewalk:both:surface': 'paving_stones',
  'sidewalk:left:traffic_sign:forward': 'DE:239',
}

test('the separate ways are found on their side, with their direction; a crossing is not one', () => {
  const graph = graphOf(road)
  expect(separateWays(graph, 'w1', 'sidewalk', 'left')).toEqual([{ id: 'w2', reversed: false }])
  expect(separateWays(graph, 'w1', 'sidewalk', 'right')).toEqual([{ id: 'w3', reversed: true }])
  expect(separateWays(graph, 'w1', 'cycleway', 'left')).toEqual([])
})

test('both sides: the ways get the tags, turned for the way against the road, and the road keeps only separate', () => {
  const graph = graphOf(road)
  expect(moveApplies(graph, 'w1', 'sidewalk', ['left', 'right'])).toBe(true)
  const plan = moveSideTagsPlan(graph, 'w1', 'sidewalk', ['left', 'right'])
  if ('refused' in plan) throw new Error(plan.refused.reason)
  expect(plan.ways).toEqual([
    {
      id: 'w2',
      tags: {
        highway: 'footway',
        footway: 'sidewalk',
        surface: 'paving_stones',
        'traffic_sign:forward': 'DE:239',
      },
    },
    { id: 'w3', tags: { highway: 'footway', footway: 'sidewalk', surface: 'paving_stones' } },
  ])
  expect(plan.roadTags).toEqual({ highway: 'residential', 'sidewalk:both': 'separate' })

  const after = plan.actions.reduce((g, action) => action(g), new Graph(graph))
  expect(after.entity('w1').tags).toEqual({ highway: 'residential', 'sidewalk:both': 'separate' })
  expect(after.entity('w3').tags.surface).toBe('paving_stones')
})

test('a key the separate way has otherwise stays on the road as a key of the side; the others move', () => {
  const graph = graphOf(road, { highway: 'footway', footway: 'sidewalk', surface: 'asphalt' })
  const plan = moveSideTagsPlan(graph, 'w1', 'sidewalk', ['left'])
  if ('refused' in plan) throw new Error(plan.refused.reason)
  expect(plan.kept).toEqual([{ side: 'left', key: 'surface' }])
  expect(plan.ways).toEqual([
    {
      id: 'w2',
      tags: {
        highway: 'footway',
        footway: 'sidewalk',
        surface: 'asphalt',
        'traffic_sign:forward': 'DE:239',
      },
    },
  ])
  expect(plan.roadTags).toEqual({
    highway: 'residential',
    'sidewalk:both': 'separate',
    // neither side moved its surface: the shared key stays as it was
    'sidewalk:both:surface': 'paving_stones',
  })
})

test('nothing that could move refuses and names the key', () => {
  const graph = graphOf(
    { highway: 'residential', 'sidewalk:left': 'separate', 'sidewalk:left:surface': 'sett' },
    { highway: 'footway', footway: 'sidewalk', surface: 'asphalt' },
  )
  expect(moveSideTagsPlan(graph, 'w1', 'sidewalk', ['left'])).toEqual({
    refused: { reason: 'different_value', side: 'left', key: 'surface', wayId: 'w2' },
  })
})

test('crossings and named footways near the road are not its sidewalk', () => {
  const graph = graphOf(road, { highway: 'footway', footway: 'crossing' })
  expect(separateWays(graph, 'w1', 'sidewalk', 'left')).toEqual([])
})

test('no separate way on the side refuses', () => {
  const graph = graphOf({
    ...road,
    'cycleway:right': 'separate',
    'cycleway:right:surface': 'asphalt',
  })
  expect(moveApplies(graph, 'w1', 'cycleway', ['right'])).toBe(true)
  expect(moveSideTagsPlan(graph, 'w1', 'cycleway', ['right'])).toEqual({
    refused: { reason: 'no_way', side: 'right' },
  })
})
