import { describe, expect, it } from 'bun:test'
import type { Fix, Rule, RuleContext } from '@osm-editor-kit/maid-validation'
import {
  lanesPipeCountMismatch,
  lanesPipeLengthMismatch,
  lanesPlacementOutOfRange,
  lanesSumMismatch,
} from './lane-rules.ts'

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

const context = {} as RuleContext
const road = { highway: 'primary', name: 'Hauptstraße' }

describe('lanes_sum_mismatch', () => {
  it('flags lanes that are not the sum, and the fix writes the sum', () => {
    const entity = way({ ...road, lanes: '3', 'lanes:forward': '2', 'lanes:backward': '2' })
    const [issue] = lanesSumMismatch.validate(entity, context)
    expect(issue?.severity).toBe('error')
    expect(issue?.message).toContain('lanes=3')
    const fix = issue?.fixes[0]
    if (!fix) throw new Error('no fix')
    let graph = graphOf(entity)
    for (const action of fix.actions(graph)) graph = action(graph)
    expect(graph.entity('w1').tags.lanes).toBe('4')
  })

  it('stays quiet when the sum is right, and off lane roads', () => {
    expect(
      lanesSumMismatch.validate(
        way({ ...road, lanes: '4', 'lanes:forward': '2', 'lanes:backward': '2' }),
        context,
      ),
    ).toHaveLength(0)
    expect(
      lanesSumMismatch.validate(
        way({ highway: 'footway', lanes: '3', 'lanes:forward': '2', 'lanes:backward': '2' }),
        context,
      ),
    ).toHaveLength(0)
  })
})

describe('lanes_pipe_count_mismatch', () => {
  it('flags a direction whose pipes have more entries than lanes', () => {
    const issues = lanesPipeCountMismatch.validate(
      way({
        ...road,
        lanes: '4',
        'lanes:forward': '2',
        'lanes:backward': '2',
        'turn:lanes:forward': 'left|through|right',
      }),
      context,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('lanes:forward=2')
  })

  it('accepts the German pattern: the extra entry is a cycle lane', () => {
    const issues = lanesPipeCountMismatch.validate(
      way({
        ...road,
        lanes: '4',
        'lanes:forward': '2',
        'lanes:backward': '2',
        'turn:lanes:forward': 'through|through|',
        'bicycle:lanes:forward': 'no|no|designated',
      }),
      context,
    )
    expect(issues).toHaveLength(0)
  })
})

describe('lanes_pipe_length_mismatch', () => {
  it('flags two pipes of one direction with different lengths', () => {
    const issues = lanesPipeLengthMismatch.validate(
      way({
        ...road,
        oneway: 'yes',
        lanes: '2',
        'turn:lanes': 'left|through',
        'width:lanes': '3|3|3',
      }),
      context,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('turn:lanes')
    expect(issues[0]?.message).toContain('width:lanes')
  })
})

describe('lanes_placement_out_of_range', () => {
  it('flags a placement on a lane the road does not have', () => {
    const issues = lanesPlacementOutOfRange.validate(
      way({
        ...road,
        oneway: 'yes',
        lanes: '2',
        'turn:lanes': 'left|through',
        placement: 'middle_of:5',
      }),
      context,
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('placement=middle_of:5')
  })
})

describe('lanes_placement_out_of_range, valid edges', () => {
  it('accepts left_of:1, the left edge of the first lane', () => {
    expect(
      lanesPlacementOutOfRange.validate(
        way({
          ...road,
          lanes: '3',
          'lanes:forward': '2',
          'lanes:backward': '1',
          'placement:forward': 'left_of:1',
        }),
        context,
      ),
    ).toHaveLength(0)
  })
})
