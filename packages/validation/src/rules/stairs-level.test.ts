import { describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import { stairsLevelMissing, stairsLevelUnreached } from './stairs-level.ts'

/**
 * Corridors that end at the nodes `a` and `b` of a stairway `a`, `m`, `b`: a corridor on `levelAtA` at `a`, one on
 * `levelAtB` at `b` (none when undefined)
 */
function scene(levelAtA?: string, levelAtB?: string) {
  return [
    node('n-a', 0, 0),
    node('n-m', 0, 0.5),
    node('n-b', 0, 1),
    node('n-x', -1, 0),
    node('n-y', -1, 1),
    ...(levelAtA === undefined
      ? []
      : [way('c-a', ['n-x', 'n-a'], { highway: 'corridor', level: levelAtA })]),
    ...(levelAtB === undefined
      ? []
      : [way('c-b', ['n-b', 'n-y'], { highway: 'corridor', level: levelAtB })]),
  ]
}

/** The tags of the way after its fix is applied, as the editor does it: on a head copy of the graph */
function tagsAfter(graph: ReturnType<typeof graphOf>, wayId: string) {
  const issues = validateChanged(stairsLevelMissing, graph, [wayId])
  const fix = issues[0]?.fixes[0]
  const after = (fix?.actions(new Graph(graph)) ?? []).reduce<Graph>(
    (head, action) => action(head),
    new Graph(graph),
  )
  return after.entity(wayId).tags
}

describe('stairs_level_missing', () => {
  it('flags steps on level 0 between corridors on 0 and 1, and offers level=0;1 with incline=up', () => {
    const graph = graphOf(
      ...scene('0', '1'),
      way('w-steps', ['n-a', 'n-m', 'n-b'], { highway: 'steps', level: '0' }),
    )
    const issues = validateChanged(stairsLevelMissing, graph, ['w-steps'])
    expect(issues.map((issue) => [issue.rule, issue.message, issue.severity])).toEqual([
      ['stairs_level_missing', 'Steps connect level 0 and 1 but have level=0', 'warning'],
    ])
    expect(issues[0]?.fixes.map((fix) => fix.label)).toEqual(['Set level=0;1'])
    expect(tagsAfter(graph, 'w-steps')).toEqual({
      highway: 'steps',
      level: '0;1',
      incline: 'up',
    })
  })

  it('offers incline=down for the reversed way, which climbs from level 1 to 0', () => {
    const graph = graphOf(
      ...scene('0', '1'),
      way('w-steps', ['n-b', 'n-m', 'n-a'], { highway: 'steps', level: '0' }),
    )
    const issues = validateChanged(stairsLevelMissing, graph, ['w-steps'])
    expect(issues.map((issue) => issue.message)).toEqual([
      'Steps connect level 1 and 0 but have level=0',
    ])
    expect(issues[0]?.fixes[0]?.label).toBe('Set level=0;1')
    expect(tagsAfter(graph, 'w-steps')).toEqual({
      highway: 'steps',
      level: '0;1',
      incline: 'down',
    })
  })

  it('leaves steps alone that already have both levels between corridors on 0 and 1', () => {
    const graph = graphOf(
      ...scene('0', '1'),
      way('w-steps', ['n-a', 'n-m', 'n-b'], { highway: 'steps', level: '0;1' }),
    )
    expect(validateChanged(stairsLevelMissing, graph, ['w-steps'])).toHaveLength(0)
    expect(validateChanged(stairsLevelUnreached, graph, ['w-steps'])).toHaveLength(0)
  })

  it('leaves a corridor on level 0 alone, though its ends touch levels 0 and 1', () => {
    const graph = graphOf(
      ...scene('0', '1'),
      way('w-corridor', ['n-a', 'n-m', 'n-b'], { highway: 'corridor', level: '0' }),
    )
    expect(validateChanged(stairsLevelMissing, graph, ['w-corridor'])).toHaveLength(0)
    expect(validateChanged(stairsLevelUnreached, graph, ['w-corridor'])).toHaveLength(0)
  })
})

describe('stairs_level_unreached', () => {
  it('leaves steps alone whose ends touch no level at all: they are not mapped into their surroundings yet', () => {
    const graph = graphOf(
      ...scene(undefined, undefined),
      way('w-steps', ['n-a', 'n-m', 'n-b'], { highway: 'steps', level: '0;1' }),
    )
    expect(validateChanged(stairsLevelUnreached, graph, ['w-steps'])).toHaveLength(0)
  })

  it('flags steps on levels 0;1 whose last end touches nothing: level 1 is not reached', () => {
    const graph = graphOf(
      ...scene('0', undefined),
      way('w-steps', ['n-a', 'n-m', 'n-b'], { highway: 'steps', level: '0;1' }),
    )
    const issues = validateChanged(stairsLevelUnreached, graph, ['w-steps'])
    expect(issues.map((issue) => [issue.rule, issue.message, issue.severity])).toEqual([
      ['stairs_level_unreached', 'Steps do not reach level 1', 'warning'],
    ])
    expect(issues[0]?.fixes).toEqual([])
    // two levels are never the missing-level case
    expect(validateChanged(stairsLevelMissing, graph, ['w-steps'])).toHaveLength(0)
  })
})
