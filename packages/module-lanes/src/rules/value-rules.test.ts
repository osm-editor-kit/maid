/**
 * The cases of Lane Studio's `test/spec/lanes/validations/lane_tags.ts` for these checks (ISC, © Lane Studio
 * contributors), in Maid's rule shape, and a few of Maid's own (parking, `est_width`, directional keys).
 */
import { describe, expect, it } from 'bun:test'
import type { Fix, Rule, RuleContext } from '@osm-editor-kit/maid-validation'
import { laneRules } from './lane-rules.ts'
import { lanesDeprecatedChange, lanesUnknownTurn, lanesWidthTooNarrow } from './value-rules.ts'

type Entity = Parameters<Rule['validate']>[0]
type Graph = Parameters<Fix['actions']>[0]

function way(tags: Record<string, string>, id = 'w1'): Entity {
  const made = {
    id,
    type: 'way',
    tags,
    update: (props: { tags?: Record<string, string> }) => way(props.tags ?? tags, id),
  }
  return made as unknown as Entity
}

function graphOf(entity: Entity): Graph {
  const graph = {
    hasEntity: (id: string) => (id === entity.id ? entity : undefined),
    entity: () => entity,
    replace: (changed: Entity) => ({ commit: () => graphOf(changed) }),
  }
  return graph as unknown as Graph
}

function applyFix(entity: Entity, fix: Fix | undefined): Record<string, string> {
  if (!fix) throw new Error('no fix')
  let graph = graphOf(entity)
  for (const action of fix.actions(graph)) graph = action(graph)
  return graph.entity('w1').tags as Record<string, string>
}

const context = {} as RuleContext
const road = { highway: 'primary', oneway: 'yes', lanes: '2' }

describe('lane value rules', () => {
  it('are part of laneRules', () => {
    const ids = laneRules.map((rule) => rule.id)
    expect(ids).toContain('lanes_unknown_turn')
    expect(ids).toContain('lanes_deprecated_change')
    expect(ids).toContain('lanes_width_too_narrow')
  })

  it('say nothing about good lane tags or off lane roads', () => {
    const good = way({
      ...road,
      'turn:lanes': 'left|through;right',
      'change:lanes': 'not_right|yes',
    })
    for (const rule of [lanesUnknownTurn, lanesDeprecatedChange, lanesWidthTooNarrow]) {
      expect(rule.validate(good, context)).toHaveLength(0)
    }
    expect(
      lanesUnknownTurn.validate(way({ highway: 'footway', 'turn:lanes': 'nonsense' }), context),
    ).toHaveLength(0)
  })
})

describe('lanes_unknown_turn', () => {
  it('finds each unknown value once and fixes the certain ones', () => {
    const entity = way({
      ...road,
      'turn:lanes': 'straight|u_turn;left',
      'turn:lanes:backward': 'straight',
    })
    const issues = lanesUnknownTurn.validate(entity, context)
    expect(issues.map((i) => i.id)).toEqual([
      'lanes_unknown_turn:w1:straight',
      'lanes_unknown_turn:w1:u_turn',
    ])
    expect(issues.every((i) => i.fixes.length === 1)).toBe(true)
    const tags = applyFix(entity, issues[1]?.fixes[0])
    expect(tags['turn:lanes']).toBe('straight|reverse;left')
    const both = applyFix(entity, issues[0]?.fixes[0])
    expect(both['turn:lanes']).toBe('through|u_turn;left')
    expect(both['turn:lanes:backward']).toBe('through')
  })

  it('offers no fix where the meaning is not certain', () => {
    const [issue] = lanesUnknownTurn.validate(
      way({ ...road, 'turn:lanes': 'leftish|through' }),
      context,
    )
    expect(issue?.message).toContain('leftish')
    expect(issue?.fixes).toHaveLength(0)
  })

  it('knows every wiki value, empty lanes and none', () => {
    const all =
      'sharp_left;left;slight_left|through;slight_right;right|sharp_right;reverse||merge_to_left;merge_to_right|slide_left;slide_right;next_left;next_right|none'
    expect(lanesUnknownTurn.validate(way({ ...road, 'turn:lanes': all }), context)).toHaveLength(0)
  })
})

describe('lanes_deprecated_change', () => {
  it('finds only_left and only_right and writes their replacement', () => {
    const entity = way({
      ...road,
      'change:lanes': 'only_left|yes',
      'change:lanes:forward': 'only_right|only_left',
    })
    const issues = lanesDeprecatedChange.validate(entity, context)
    expect(issues.map((i) => i.id)).toEqual([
      'lanes_deprecated_change:w1:only_left',
      'lanes_deprecated_change:w1:only_right',
    ])
    const tags = applyFix(entity, issues[0]?.fixes[0])
    expect(tags['change:lanes']).toBe('not_right|yes')
    expect(tags['change:lanes:forward']).toBe('only_right|not_right')
  })
})

describe('lanes_width_too_narrow', () => {
  it('flags a width narrower than the lanes, not an equal one', () => {
    const [issue] = lanesWidthTooNarrow.validate(
      way({ ...road, width: '6', 'width:lanes': '3.5|3.5' }),
      context,
    )
    expect(issue?.message).toContain('7 m')
    expect(issue?.fixes).toHaveLength(0)
    expect(
      lanesWidthTooNarrow.validate(way({ ...road, width: '7', 'width:lanes': '3.5|3.5' }), context),
    ).toHaveLength(0)
    expect(
      lanesWidthTooNarrow.validate(
        way({ ...road, width: '6.5', 'width:lanes': '3.25|3.3' }),
        context,
      ),
    ).toHaveLength(0)
  })

  it('counts parking on the carriageway, but not est_width or roads without width:lanes', () => {
    const parked = {
      ...road,
      width: '9',
      'width:lanes': '3.5|3.5',
      'parking:right': 'lane',
      'parking:right:width': '2.5',
    }
    expect(lanesWidthTooNarrow.validate(way(parked), context)).toHaveLength(1)
    expect(
      lanesWidthTooNarrow.validate(
        way({ ...road, est_width: '6', 'width:lanes': '3.5|3.5' }),
        context,
      ),
    ).toHaveLength(0)
    expect(lanesWidthTooNarrow.validate(way({ ...road, width: '3' }), context)).toHaveLength(0)
  })
})
