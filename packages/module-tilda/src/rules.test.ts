import { describe, expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { RuleContext } from '@osm-editor-kit/maid-validation'
import { applyTagFix, validateTags } from '@tilda-geo/bicycle-infrastructure-tagging'
import { tildaTagRules } from './rules.ts'

const model = new ModelContext()

/** A straight way of 100 m going east, with these tags */
function road(tags: Record<string, string>) {
  const graph = new Graph(model, [
    new OsmNode(model, { id: 'n-1', loc: [13.4, 52.5], tags: {} }),
    new OsmNode(model, { id: 'n-2', loc: [13.4015, 52.5], tags: {} }),
    new OsmWay(model, { id: 'w-1', nodes: ['n-1', 'n-2'], tags }),
  ])
  const context: RuleContext = {
    graph,
    waysNear: () => [],
    validated: new Set(['w-1']),
    memo: new Map(),
  }
  return { graph, context, way: graph.entity('w-1') }
}

function run(tags: Record<string, string>, profile?: 'tilda-geo' | 'radnetz-berlin') {
  const { graph, context, way } = road(tags)
  return { graph, issues: tildaTagRules(profile ? { profile } : {}).validate(way, context) }
}

describe('tildaTagRules: the tag rules of the TILDA tagging package', () => {
  test('cycleway:both:oneway=yes on a two-way road is a warning; the fix removes the tag', () => {
    const { graph, issues } = run({
      highway: 'residential',
      'cycleway:both': 'lane',
      'cycleway:both:lane': 'exclusive',
      'cycleway:both:traffic_sign': 'DE:237',
      'cycleway:both:oneway': 'yes',
    })
    const issue = issues.find((i) => i.data?.tildaRule === 'unexpected_oneway_direction')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(issue?.loc).toBeDefined()
    const fix = issue!.fixes[0]!
    const after = fix
      .actions(new Graph(graph))
      .reduce<Graph>((head, action) => action(head), new Graph(graph))
    expect(after.entity('w-1').tags['cycleway:both:oneway']).toBeUndefined()
    expect(after.entity('w-1').tags['cycleway:both']).toBe('lane')
  })

  test('a finding on both sides gives two issues with their own ids', () => {
    const { issues } = run({
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:right': 'lane',
    })
    const ids = issues.map((i) => i.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('the missing attributes of the checklist (a missing width) are left out', () => {
    const { issues } = run({ highway: 'cycleway', oneway: 'yes', segregated: 'no' })
    expect(issues.some((i) => i.data?.tildaRule === 'missing_width')).toBe(false)
    expect(issues.some((i) => i.data?.tildaRule === 'missing_surface')).toBe(false)
  })

  test('a lane oneway that repeats the default is a hint (info)', () => {
    const { issues } = run({
      highway: 'residential',
      'cycleway:right': 'lane',
      'cycleway:right:lane': 'exclusive',
      'cycleway:right:oneway': 'yes',
    })
    const issue = issues.find((i) => i.data?.tildaRule === 'cycleway_oneway_redundant')
    expect(issue?.severity).toBe('info')
  })

  test('the Radnetz rules run with the default profile and not with tilda-geo', () => {
    // yes on the right of a road drawn against its one-way traffic (oneway=-1)
    const tags = {
      highway: 'residential',
      oneway: '-1',
      'cycleway:right': 'lane',
      'cycleway:right:oneway': 'yes',
    }
    const radnetz = run(tags).issues.map((i) => i.data?.tildaRule)
    const tilda = run(tags, 'tilda-geo').issues.map((i) => i.data?.tildaRule)
    expect(radnetz).toContain('cycleway_oneway_wrong')
    expect(tilda).not.toContain('cycleway_oneway_wrong')
  })

  test('a way that is not a highway, and a plain road, have no issues', () => {
    expect(run({ building: 'yes' }).issues).toEqual([])
    expect(run({ highway: 'residential' }).issues).toEqual([])
  })
})

describe('oneway_reverse_way: the fix is a redraw, the riding direction stays', () => {
  const profile = 'radnetz-berlin' as const
  const inputs: Record<string, Record<string, string>> = {
    'oneway=-1 with a kerb on the left': {
      highway: 'cycleway',
      oneway: '-1',
      'separation:left': 'kerb',
    },
    'oneway:bicycle=-1 with a kerb on the left': {
      highway: 'path',
      bicycle: 'designated',
      foot: 'designated',
      segregated: 'no',
      oneway: 'no',
      'oneway:bicycle': '-1',
      'separation:left': 'kerb',
    },
    'oneway=-1 with sides and a lane direction': {
      highway: 'cycleway',
      oneway: '-1',
      'separation:left': 'kerb',
      'buffer:right': '1',
      'traffic_mode:left': 'parking',
      'surface:left': 'asphalt',
    },
  }

  for (const [name, tags] of Object.entries(inputs)) {
    test(`the tags after the fix are those of the package's applyTagFix: ${name}`, () => {
      const finding = validateTags(tags, { profile }).find((f) => f.ruleId === 'oneway_reverse_way')
      expect(finding).toBeDefined()
      const tagFix = finding!.fixes[0]!
      const expected = applyTagFix(tags, tagFix)

      const { graph, issues } = run(tags, profile)
      const issue = issues.find((i) => i.data?.tildaRule === 'oneway_reverse_way')
      expect(issue).toBeDefined()
      const fix = issue!.fixes[0]!
      const after = fix
        .actions(new Graph(graph))
        .reduce<Graph>((head, action) => action(head), new Graph(graph))
      expect(after.entity('w-1').tags).toEqual(expected as Record<string, string>)
      // the nodes of the way are in the opposite order
      expect((after.entity('w-1') as OsmWay).nodes).toEqual(['n-2', 'n-1'])
    })
  }

  test('a kerb on the left of a oneway=-1 cycleway stays on the left, and the way points the other way', () => {
    const { graph, issues } = run(
      { highway: 'cycleway', oneway: '-1', 'separation:left': 'kerb' },
      profile,
    )
    const issue = issues.find((i) => i.data?.tildaRule === 'oneway_reverse_way')!
    const after = issue.fixes[0]!.actions(new Graph(graph)).reduce<Graph>(
      (head, action) => action(head),
      new Graph(graph),
    )
    expect(after.entity('w-1').tags).toEqual({
      highway: 'cycleway',
      oneway: 'yes',
      'separation:left': 'kerb',
    })
  })
})
