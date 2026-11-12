import { describe, expect, it } from 'bun:test'
import type { Fix, Rule, RuleContext } from '@osm-editor-kit/maid-validation'
import {
  golfBunkerSand,
  golfCoursePoint,
  golfGenericName,
  golfHoleHandicap,
  golfHoleKey,
  golfHolePar,
  golfHolePoints,
  golfHoleRef,
  golfHoleSharedNodes,
  golfSport,
  golfWaterNatural,
  isGenericName,
} from './rules.ts'

type Entity = Parameters<Rule['validate']>[0]
type Graph = Parameters<Fix['actions']>[0]

function entityOf(
  type: 'way' | 'node',
  tags: Record<string, string>,
  id = type === 'way' ? 'w1' : 'n1',
  nodes: string[] = [],
): Entity {
  const made = {
    id,
    type,
    tags,
    nodes,
    update: (props: { tags?: Record<string, string> }) =>
      entityOf(type, props.tags ?? tags, id, nodes),
  }
  return made as unknown as Entity
}
const way = (tags: Record<string, string>) => entityOf('way', tags)
const node = (tags: Record<string, string>) => entityOf('node', tags)

function graphOf(entity: Entity): Graph {
  const graph = {
    hasEntity: (id: string) => (id === entity.id ? entity : undefined),
    entity: () => entity,
    replace: (changed: Entity) => ({ commit: () => graphOf(changed) }),
  }
  return graph as unknown as Graph
}

/** The tags after the first fix of the first issue */
function fixed(rule: Rule, entity: Entity) {
  const fix = rule.validate(entity, context)[0]?.fixes[0]
  if (!fix) throw new Error('no fix')
  let graph = graphOf(entity)
  for (const action of fix.actions(graph)) graph = action(graph)
  return graph.entity(entity.id).tags
}

const context = {} as RuleContext

describe('golf holes', () => {
  it('a hole needs a number', () => {
    expect(golfHoleRef.validate(way({ golf: 'hole', par: '4' }), context)).toHaveLength(1)
    expect(golfHoleRef.validate(way({ golf: 'hole', ref: '7' }), context)).toHaveLength(0)
    expect(golfHoleRef.validate(way({ golf: 'green' }), context)).toHaveLength(0)
  })

  it('a hole needs a par from 3 to 6', () => {
    expect(golfHolePar.validate(way({ golf: 'hole', ref: '1' }), context)).toHaveLength(1)
    expect(golfHolePar.validate(way({ golf: 'hole', par: '9' }), context)).toHaveLength(1)
    expect(golfHolePar.validate(way({ golf: 'hole', par: '4.5' }), context)).toHaveLength(1)
    expect(golfHolePar.validate(way({ golf: 'hole', par: '5' }), context)).toHaveLength(0)
  })

  it('a handicap, when there, is 1 to 18', () => {
    expect(golfHoleHandicap.validate(way({ golf: 'hole' }), context)).toHaveLength(0)
    expect(golfHoleHandicap.validate(way({ golf: 'hole', handicap: '0' }), context)).toHaveLength(1)
    expect(golfHoleHandicap.validate(way({ golf: 'hole', handicap: '19' }), context)).toHaveLength(
      1,
    )
    expect(golfHoleHandicap.validate(way({ golf: 'hole', handicap: '12' }), context)).toHaveLength(
      0,
    )
  })
})

describe('companion tags', () => {
  it('a bunker without surface is flagged and the fix adds surface=sand', () => {
    const bunker = way({ golf: 'bunker' })
    expect(golfBunkerSand.validate(bunker, context)).toHaveLength(1)
    expect(fixed(golfBunkerSand, bunker)).toEqual({ golf: 'bunker', surface: 'sand' })
    expect(golfBunkerSand.validate(way({ golf: 'bunker', surface: 'sand' }), context)).toHaveLength(
      0,
    )
  })

  it('a water hazard without natural=water is flagged and the fix adds it', () => {
    const pond = way({ golf: 'lateral_water_hazard' })
    expect(golfWaterNatural.validate(pond, context)).toHaveLength(1)
    expect(fixed(golfWaterNatural, pond)).toEqual({
      golf: 'lateral_water_hazard',
      natural: 'water',
    })
    expect(
      golfWaterNatural.validate(way({ golf: 'water_hazard', natural: 'water' }), context),
    ).toHaveLength(0)
  })
})

describe('names and sport', () => {
  it('knows generic names', () => {
    for (const name of [
      'Bunker',
      'green 3',
      'Hole 12',
      'Loch Nr. 7',
      'Abschlag',
      'Sand trap',
      'fairway 1',
      '18th Hole',
    ])
      expect(isGenericName(name)).toBe(true)
    for (const name of ['Swilcan Burn', 'Hell Bunker', 'Road Hole Bunker'])
      expect(isGenericName(name)).toBe(false)
  })

  it('removes a generic name from a golf feature', () => {
    const green = way({ golf: 'green', name: 'Green 4' })
    expect(golfGenericName.validate(green, context)).toHaveLength(1)
    expect(fixed(golfGenericName, green)).toEqual({ golf: 'green' })
  })

  it('removes sport=golf from a part of the course, not from the course', () => {
    const fairway = way({ golf: 'fairway', sport: 'golf' })
    expect(fixed(golfSport, fairway)).toEqual({ golf: 'fairway' })
    expect(
      golfSport.validate(way({ leisure: 'golf_course', sport: 'golf' }), context),
    ).toHaveLength(0)
  })

  it('flags a golf course mapped as a point', () => {
    expect(golfCoursePoint.validate(node({ leisure: 'golf_course' }), context)).toHaveLength(1)
    expect(golfCoursePoint.validate(way({ leisure: 'golf_course' }), context)).toHaveLength(0)
  })
})

describe('the line of play', () => {
  it('moves golf_hole to ref', () => {
    const hole = way({ golf: 'hole', golf_hole: '7' })
    expect(fixed(golfHoleKey, hole)).toEqual({ golf: 'hole', ref: '7' })
    expect(
      golfHoleKey.validate(way({ golf: 'hole', golf_hole: '7', ref: '8' }), context)[0]?.fixes,
    ).toEqual([])
  })

  it('has one point fewer than its par', () => {
    const withNodes = (nodes: string[], par: string) =>
      entityOf('way', { golf: 'hole', par }, 'w1', nodes)
    expect(golfHolePoints.validate(withNodes(['a', 'b'], '3'), context)).toHaveLength(0)
    expect(golfHolePoints.validate(withNodes(['a', 'b', 'c'], '4'), context)).toHaveLength(0)
    expect(golfHolePoints.validate(withNodes(['a', 'b', 'c'], '3'), context)).toHaveLength(1)
  })

  it('shares no node with a golf feature on the ground', () => {
    const hole = entityOf('way', { golf: 'hole' }, 'w1', ['n1', 'n2'])
    const green = { id: 'w2', tags: { golf: 'green' } }
    const road = { id: 'w3', tags: { highway: 'path' } }
    const contextWith = (parents: { id: string; tags: Record<string, string> }[]) =>
      ({
        graph: {
          hasEntity: (id: string) => ({ id }),
          parentWays: (node: { id: string }) => (node.id === 'n2' ? [hole, ...parents] : [hole]),
        },
      }) as unknown as RuleContext
    expect(golfHoleSharedNodes.validate(hole, contextWith([road]))).toHaveLength(0)
    const [issue] = golfHoleSharedNodes.validate(hole, contextWith([green]))
    expect(issue?.entityIds).toEqual(['w1', 'w2'])
  })
})
