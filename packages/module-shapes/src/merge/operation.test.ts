import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { mergeOperation, visibleOperations } from '@osm-editor-kit/maid-operations'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import type { MergeRefusal } from './merge.ts'
import { mergeAreasOperation, mergeAreasOperationWith, refusalSentence } from './operation.ts'

const modelContext = new ModelContext()

// Coordinates in metres east and north of a point near lon 13.4, lat 52.5, as in merge.test.ts
const LON0 = 13.4
const LAT0 = 52.5
const PER_DEGREE = (Math.PI / 180) * 6371008.8
const METRES_PER_LON = PER_DEGREE * Math.cos((LAT0 * Math.PI) / 180)
const METRES_PER_LAT = PER_DEGREE

function at(east: number, north: number): [number, number] {
  return [LON0 + east / METRES_PER_LON, LAT0 + north / METRES_PER_LAT]
}

function node(id: string, east: number, north: number, tags: Record<string, string> = {}): OsmNode {
  return new OsmNode(modelContext, { id, loc: at(east, north), tags })
}

function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(modelContext, { id, nodes, tags })
}

/** A closed way: the first node repeated at the end, as OSM stores it */
function ring(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return way(id, [...nodes, ...nodes.slice(0, 1)], tags)
}

/** The four corner nodes of a square, named `n<prefix>1` to `n<prefix>4` */
function square(prefix: string, x: number, y: number, size: number): OsmNode[] {
  return [
    node(`n${prefix}1`, x, y),
    node(`n${prefix}2`, x + size, y),
    node(`n${prefix}3`, x + size, y + size),
    node(`n${prefix}4`, x, y + size),
  ]
}

function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(modelContext, entities)
}

/** Ten-metre square `w1` at the origin and `w2` offset by (dx, dy), as two closed ways with the given tags */
function twoSquares(
  dx: number,
  dy: number,
  tags: Record<string, string> = { area: 'yes', building: 'yes' },
) {
  return [
    ...square('a', 0, 0, 10),
    ...square('b', dx, dy, 10),
    ring('w1', ['na1', 'na2', 'na3', 'na4'], tags),
    ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], tags),
  ]
}

function contextOf(graph: Graph, selected: string[]): OperationContext {
  return { graph, selected }
}

const REFUSALS: MergeRefusal[] = [
  'not_two_areas',
  'multipolygon',
  'conflicting_tags',
  'conflicting_relations',
  'contained',
  'not_touching',
  'shared_nodes_outside',
  'tagged_nodes',
  'not_simple',
  'too_many_nodes',
]

describe('merge-areas: when it is offered', () => {
  it('two overlapping closed areas are offered and can run', () => {
    const graph = graphOf(...twoSquares(7, 7))
    const context = contextOf(graph, ['w1', 'w2'])
    expect(mergeAreasOperation.applies(context)).toBe(true)
    expect(mergeAreasOperation.disabled(context)).toBeUndefined()
  })

  it('one area, or three areas, is not offered', () => {
    const graph = graphOf(
      ...twoSquares(7, 7),
      ...square('c', 40, 0, 10),
      ring('w3', ['nc1', 'nc2', 'nc3', 'nc4'], { area: 'yes', building: 'yes' }),
    )
    expect(mergeAreasOperation.applies(contextOf(graph, ['w1']))).toBe(false)
    expect(mergeAreasOperation.applies(contextOf(graph, ['w1', 'w2', 'w3']))).toBe(false)
    expect(mergeAreasOperation.applies(contextOf(graph, []))).toBe(false)
  })

  it('two open lines are not offered, so the line merge keeps C for them', () => {
    const graph = graphOf(
      node('na1', 0, 0),
      node('na2', 10, 0),
      node('na3', 20, 0),
      way('l1', ['na1', 'na2']),
      way('l2', ['na2', 'na3']),
    )
    const context = contextOf(graph, ['l1', 'l2'])
    expect(mergeAreasOperation.applies(context)).toBe(false)
    expect(mergeOperation.applies(context)).toBe(true)
  })

  it('a line and an area are not offered', () => {
    const graph = graphOf(
      ...twoSquares(7, 7),
      node('nx', 40, 40),
      node('ny', 60, 40),
      way('l1', ['nx', 'ny']),
    )
    expect(mergeAreasOperation.applies(contextOf(graph, ['w1', 'l1']))).toBe(false)
  })

  it('a closed road loop is a line, not an area, so it is not offered', () => {
    const graph = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { highway: 'service' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { highway: 'service' }),
    )
    expect(mergeAreasOperation.applies(contextOf(graph, ['w1', 'w2']))).toBe(false)
  })

  it('a multipolygon relation is not offered', () => {
    const graph = graphOf(
      ...twoSquares(7, 7),
      new OsmRelation(modelContext, {
        id: 'r1',
        tags: { type: 'multipolygon', building: 'yes' },
        members: [{ type: 'way', id: 'w1', role: 'outer' }],
      }),
    )
    expect(mergeAreasOperation.applies(contextOf(graph, ['r1', 'w2']))).toBe(false)
  })

  it('apart areas and an area inside another are not this operation: the core Merge makes their multipolygon', () => {
    const apart = contextOf(graphOf(...twoSquares(30, 0)), ['w1', 'w2'])
    expect(mergeAreasOperation.applies(apart)).toBe(false)
    expect(mergeOperation.applies(apart)).toBe(true)
    expect(mergeOperation.disabled(apart)).toBeUndefined()

    const contained = contextOf(
      graphOf(
        ...square('a', 0, 0, 20),
        ...square('b', 5, 5, 5),
        ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes' }),
        ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes' }),
      ),
      ['w1', 'w2'],
    )
    expect(mergeAreasOperation.applies(contained)).toBe(false)
    expect(mergeOperation.applies(contained)).toBe(true)
  })

  it('an area inside another with different tags is not the union: the core Merge makes the multipolygon', () => {
    // the drawn pair: the outer is a building, the inner has only area=yes, so their tags differ as well as their place
    const contained = contextOf(
      graphOf(
        ...square('a', 0, 0, 20),
        ...square('b', 5, 5, 5),
        ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', building: 'yes' }),
        ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes' }),
      ),
      ['w1', 'w2'],
    )
    expect(mergeAreasOperation.applies(contained)).toBe(false)
    expect(mergeOperation.applies(contained)).toBe(true)
    expect(mergeOperation.disabled(contained)).toBeUndefined()
    expect(
      visibleOperations([mergeOperation, mergeAreasOperation], contained).map((op) => op.id),
    ).toEqual(['merge'])
  })

  it('apart areas with different tags are not the union either', () => {
    const apart = contextOf(
      graphOf(
        ...square('a', 0, 0, 10),
        ...square('b', 30, 0, 10),
        ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', building: 'yes' }),
        ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes' }),
      ),
      ['w1', 'w2'],
    )
    expect(mergeAreasOperation.applies(apart)).toBe(false)
    expect(mergeOperation.applies(apart)).toBe(true)
  })

  it('for overlapping areas one Merge is shown: this operation, which supersedes the core Merge', () => {
    const areas = contextOf(graphOf(...twoSquares(7, 7)), ['w1', 'w2'])
    expect(mergeOperation.applies(areas)).toBe(true)
    expect(mergeAreasOperation.applies(areas)).toBe(true)
    expect(
      visibleOperations([mergeOperation, mergeAreasOperation], areas).map((op) => op.id),
    ).toEqual(['merge-areas'])
  })

  it('a refused union still supersedes the core Merge, so the menu shows its reason and no second Merge', () => {
    const graph = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', building: 'yes' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes', building: 'house' }),
    )
    const context = contextOf(graph, ['w1', 'w2'])
    expect(
      visibleOperations([mergeOperation, mergeAreasOperation], context).map((op) => op.id),
    ).toEqual(['merge-areas'])
    expect(mergeAreasOperation.disabled(context)).toBe('These areas have different tags.')
  })

  it('an area and a line get no Merge at all', () => {
    const graph = graphOf(
      ...twoSquares(7, 7),
      node('nx', 40, 40),
      node('ny', 60, 40),
      way('l1', ['nx', 'ny']),
    )
    const context = contextOf(graph, ['w1', 'l1'])
    expect(mergeOperation.applies(context)).toBe(false)
    expect(visibleOperations([mergeOperation, mergeAreasOperation], context)).toEqual([])
  })
})

describe('merge-areas: run', () => {
  it('returns one action, the annotation, and selects the survivor; the action merges the two ways', () => {
    const graph = graphOf(...twoSquares(7, 7))
    const context = contextOf(graph, ['w1', 'w2'])
    const result = mergeAreasOperation.run(context)
    expect(result.annotation).toBe('Merged two areas')
    expect(result.actions).toHaveLength(1)

    const after = result.actions[0]!(new Graph(graph))
    const survivor = result.select!(after)
    expect(survivor).toHaveLength(1)
    const [id = ''] = survivor
    expect(['w1', 'w2']).toContain(id)
    // one outline with the 8 corners of the L shape: two of them are new crossing points
    expect((after.entity(id) as OsmWay).nodes).toHaveLength(9)
    const loser = id === 'w1' ? 'w2' : 'w1'
    expect(after.hasEntity(loser)).toBeUndefined()
  })
})

describe('merge-areas: texts of the refusals', () => {
  it('each of the ten refusals has its own sentence', () => {
    const sentences = REFUSALS.map((refusal) => refusalSentence(refusal))
    for (const sentence of sentences) expect(sentence.trim().length).toBeGreaterThan(0)
    expect(new Set(sentences).size).toBe(REFUSALS.length)
  })

  it('conflicting tags say so in one sentence', () => {
    const graph = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', building: 'yes' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes', building: 'house' }),
    )
    expect(mergeAreasOperation.disabled(contextOf(graph, ['w1', 'w2']))).toBe(
      'These areas have different tags.',
    )
  })

  it('a refused merge says why for each reason the graph can produce', () => {
    const cases: [MergeRefusal, Graph][] = [
      [
        'conflicting_relations',
        graphOf(
          ...twoSquares(7, 7),
          new OsmRelation(modelContext, {
            id: 'r1',
            tags: { type: 'boundary' },
            members: [{ type: 'way', id: 'w1', role: '' }],
          }),
        ),
      ],
      [
        'shared_nodes_outside',
        graphOf(...twoSquares(7, 7), node('nx', 40, 40), way('w9', ['nb1', 'nx'])),
      ],
      [
        'tagged_nodes',
        graphOf(
          node('na1', 0, 0),
          node('na2', 10, 0),
          node('na3', 10, 10, { name: 'Hof' }),
          node('na4', 0, 10),
          ...square('b', 7, 7, 10),
          ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes' }),
          ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes' }),
        ),
      ],
      [
        'not_simple',
        graphOf(
          node('nu1', 0, 0),
          node('nu2', 30, 0),
          node('nu3', 30, 30),
          node('nu4', 20, 30),
          node('nu5', 20, 10),
          node('nu6', 10, 10),
          node('nu7', 10, 30),
          node('nu8', 0, 30),
          node('nv1', 5, 25),
          node('nv2', 25, 25),
          node('nv3', 25, 35),
          node('nv4', 5, 35),
          ring('w1', ['nu1', 'nu2', 'nu3', 'nu4', 'nu5', 'nu6', 'nu7', 'nu8'], {
            area: 'yes',
            building: 'yes',
          }),
          ring('w2', ['nv1', 'nv2', 'nv3', 'nv4'], { area: 'yes', building: 'yes' }),
        ),
      ],
    ]
    for (const [refusal, graph] of cases) {
      const context = contextOf(graph, ['w1', 'w2'])
      expect(mergeAreasOperation.applies(context)).toBe(true)
      expect(mergeAreasOperation.disabled(context)).toBe(refusalSentence(refusal))
    }
  })
})

describe('merge-areas: tags combined (the building editor)', () => {
  const combine = mergeAreasOperationWith({ tags: 'combine' })

  function overlapping(a: Record<string, string>, b: Record<string, string>): Graph {
    return graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      // area=yes as in the tests above: the model here has no area keys, so a building alone is no area
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', ...a }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes', ...b }),
    )
  }

  function merged(graph: Graph): Record<string, string> {
    const result = combine.run(contextOf(graph, ['w1', 'w2']))
    const after = result.actions[0]!(new Graph(graph))
    const [id = ''] = result.select!(after)
    return (after.entity(id) as OsmWay).tags
  }

  it('building=yes gives way to building=house, and a key on one area only is kept', () => {
    const graph = overlapping(
      { building: 'yes', 'building:levels': '3' },
      { building: 'house', 'addr:housenumber': '12' },
    )
    expect(combine.disabled(contextOf(graph, ['w1', 'w2']))).toBeUndefined()
    expect(merged(graph)).toMatchObject({
      building: 'house',
      'building:levels': '3',
      'addr:housenumber': '12',
    })
  })

  it('two values of one key ask in the confirm dialog: the box marks them, the pick decides', () => {
    const graph = overlapping(
      { building: 'house', 'addr:housenumber': '12', roof: 'flat' },
      { building: 'garage', 'addr:housenumber': '14' },
    )
    const context = contextOf(graph, ['w1', 'w2'])
    expect(combine.disabled(context)).toBeUndefined()
    const details = combine.details!(context)
    expect(details?.rows.filter((row) => row.conflict).map((row) => row.label)).toEqual([
      'addr:housenumber',
      'building',
    ])
    const asked = combine.confirm!(context)
    expect(asked?.picks).toEqual([
      { key: 'addr:housenumber', options: ['12', '14'] },
      { key: 'building', options: ['house', 'garage'] },
    ])
    // by default the survivor's values (w1, the oldest)
    expect(asked?.after).toMatchObject({
      building: 'house',
      'addr:housenumber': '12',
      roof: 'flat',
    })
    const picked = { ...context, picks: { building: 'garage', 'addr:housenumber': '14' } }
    expect(combine.confirm!(picked)?.after).toMatchObject({
      building: 'garage',
      'addr:housenumber': '14',
    })
    const result = combine.run(picked)
    const after = result.actions[0]!(new Graph(graph))
    const [id = ''] = result.select!(after)
    expect((after.entity(id) as OsmWay).tags).toMatchObject({
      building: 'garage',
      'addr:housenumber': '14',
      roof: 'flat',
    })
  })

  it('equal tags, or an untagged sketch joined to a building, run without asking', () => {
    const equal = overlapping({ building: 'house' }, { building: 'house' })
    expect(combine.confirm!(contextOf(equal, ['w1', 'w2']))).toBeUndefined()
    expect(combine.details!(contextOf(equal, ['w1', 'w2']))).toBeUndefined()
    const sketch = overlapping({}, { building: 'house' })
    expect(combine.confirm!(contextOf(sketch, ['w1', 'w2']))).toBeUndefined()
  })

  it('building=yes and building=house ask too, with nothing to pick: the diff shows the change', () => {
    const graph = overlapping({ building: 'yes' }, { building: 'house' })
    const asked = combine.confirm!(contextOf(graph, ['w1', 'w2']))
    expect(asked?.picks).toEqual([])
    expect(asked?.before).toMatchObject({ building: 'yes' })
    expect(asked?.after).toMatchObject({ building: 'house' })
  })

  it('three overlapping buildings merge into one outline in one step', () => {
    const graph = graphOf(
      ...square('a', 0, 0, 10),
      ...square('b', 7, 7, 10),
      ...square('c', 14, 14, 10),
      ring('w1', ['na1', 'na2', 'na3', 'na4'], { area: 'yes', building: 'house' }),
      ring('w2', ['nb1', 'nb2', 'nb3', 'nb4'], { area: 'yes', building: 'house' }),
      ring('w3', ['nc1', 'nc2', 'nc3', 'nc4'], { area: 'yes', building: 'house' }),
    )
    // w3 only touches w2, so the order of the selection does not matter
    for (const selected of [
      ['w1', 'w2', 'w3'],
      ['w3', 'w1', 'w2'],
    ]) {
      const context = contextOf(graph, selected)
      expect(mergeAreasOperation.applies(context)).toBe(true)
      expect(mergeAreasOperation.disabled(context)).toBeUndefined()
      const result = mergeAreasOperation.run(context)
      expect(result.annotation).toBe('Merged 3 areas')
      const after = result.actions[0]!(new Graph(graph))
      const survivors = selected.filter((id) => after.hasEntity(id))
      expect(survivors).toEqual(['w1'])
      // the staircase of three squares: 12 corners, 4 of them new crossings
      expect(new Set((after.entity('w1') as OsmWay).nodes).size).toBe(12)
    }
  })

  it('the default operation still wants equal tags', () => {
    const graph = overlapping({ building: 'yes' }, { building: 'house' })
    expect(mergeAreasOperation.disabled(contextOf(graph, ['w1', 'w2']))).toBe(
      'These areas have different tags.',
    )
  })
})
