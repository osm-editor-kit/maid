import { expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import { extractOperations } from './extract-operations.ts'
import { moveSideTagsOperations } from './operations.ts'
import { sideOptions } from './side-options.ts'
import { loadSignRules } from './sign-rules.ts'

const context = new ModelContext()
const node = (id: string, lon: number, lat: number) => new OsmNode(context, { id, loc: [lon, lat] })
const way = (id: string, nodes: string[], tags: Record<string, string>) =>
  new OsmWay(context, { id, nodes, tags })
/** Metres north of the road, in degrees */
const north = (metres: number) => 52.5 + metres / 111_320
const sidewalk = { highway: 'footway', footway: 'sidewalk' }
const road = {
  highway: 'residential',
  'sidewalk:left': 'separate',
  'sidewalk:left:surface': 'asphalt',
}

/** A road running east; on its left a sidewalk in two pieces 4 m away (w2, w3) and, optionally, one 12 m away (w4) */
function graphOf(withSecond: boolean) {
  return new Graph(context, [
    node('n1', 13.4, 52.5),
    node('n2', 13.402, 52.5),
    node('n3', 13.4, north(4)),
    node('n4', 13.401, north(4)),
    node('n5', 13.402, north(4)),
    node('n6', 13.4, north(12)),
    node('n7', 13.402, north(12)),
    way('w1', ['n1', 'n2'], road),
    way('w2', ['n3', 'n4'], sidewalk),
    way('w3', ['n4', 'n5'], sidewalk),
    ...(withSecond ? [way('w4', ['n6', 'n7'], sidewalk)] : []),
  ])
}

const moveLeft = moveSideTagsOperations.find((o) => o.id === 'move-sidewalk-tags-left')!

test('the pieces of one sidewalk are one option: no choice, both pieces get the tags', () => {
  const graph = graphOf(false)
  const options = sideOptions(graph, 'w1', 'sidewalk', 'left')
  expect(options.map((o) => o.key)).toEqual(['w2+w3'])
  const ctx = { graph, selected: ['w1'] }
  expect(moveLeft.choices!(ctx)).toEqual([])
  expect(moveLeft.preview!(ctx)).toHaveLength(2)
})

test('two sidewalks along the same stretch are a choice, nearest first; the picked one alone gets the tags', () => {
  const graph = graphOf(true)
  const options = sideOptions(graph, 'w1', 'sidewalk', 'left')
  expect(options.map((o) => o.key)).toEqual(['w2+w3', 'w4'])
  expect(Math.round(options[0]!.distance)).toBe(4)
  expect(Math.round(options[1]!.distance)).toBe(12)

  const ctx = { graph, selected: ['w1'] }
  const choices = moveLeft.choices!(ctx)
  expect(choices.map((c) => c.id)).toEqual(['left:w2+w3', 'left:w4'])
  // the menu row without a pick marks every candidate, a pick only its own ways
  expect(moveLeft.preview!(ctx)).toHaveLength(3)
  expect(moveLeft.preview!({ ...ctx, choice: 'left:w4' })).toHaveLength(1)

  const after = moveLeft
    .run({ ...ctx, choice: 'left:w4' })
    .actions.reduce((g, action) => action(g), new Graph(graph))
  expect(after.entity('w4').tags.surface).toBe('asphalt')
  expect(after.entity('w2').tags.surface).toBeUndefined()
  expect(after.entity('w1').tags['sidewalk:left:surface']).toBeUndefined()
})

test('extract previews the new way as a dotted helper line on its side', async () => {
  await loadSignRules()
  const graph = new Graph(context, [
    node('n1', 13.4, 52.5),
    node('n2', 13.402, 52.5),
    way('w1', ['n1', 'n2'], { highway: 'residential', sidewalk: 'both' }),
  ])
  const extractRight = extractOperations.find((o) => o.id === 'extract-sidewalk-right')!
  const ctx = { graph, selected: ['w1'] }
  expect(extractRight.applies(ctx)).toBe(true)
  expect(extractRight.disabled(ctx)).toBeUndefined()
  const [line] = extractRight.preview!(ctx)
  if (!line || Array.isArray(line)) throw new Error('expected a helper line')
  expect(line.style).toBe('helper')
  // right of a road running east is south
  expect(line.line.every(([, lat]) => lat < 52.5)).toBe(true)
})
