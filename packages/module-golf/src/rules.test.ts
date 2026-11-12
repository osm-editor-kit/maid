import { describe, expect, it } from 'bun:test'
import type { Fix, Rule, RuleContext } from '@osm-editor-kit/maid-validation'
import {
  golfBunkerSand,
  golfCoursePoint,
  golfGenericName,
  golfHoleHandicap,
  golfHolePar,
  golfHoleRef,
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
): Entity {
  const made = {
    id,
    type,
    tags,
    update: (props: { tags?: Record<string, string> }) => entityOf(type, props.tags ?? tags, id),
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
  it('a bunker without natural=sand is flagged and the fix adds it', () => {
    const bunker = way({ golf: 'bunker' })
    expect(golfBunkerSand.validate(bunker, context)).toHaveLength(1)
    expect(fixed(golfBunkerSand, bunker)).toEqual({ golf: 'bunker', natural: 'sand' })
    expect(golfBunkerSand.validate(way({ golf: 'bunker', natural: 'sand' }), context)).toHaveLength(
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
    for (const name of ['Bunker', 'green 3', 'Hole 12', 'Loch Nr. 7', 'Abschlag', 'Sand trap'])
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
