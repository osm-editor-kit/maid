import { describe, expect, test } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { RuleContext } from '@osm-editor-kit/maid-validation'
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

  test('findings of the severity info (a missing width) are left out', () => {
    const { issues } = run({ highway: 'cycleway', oneway: 'yes', segregated: 'no' })
    expect(issues.every((i) => i.severity === 'error' || i.severity === 'warning')).toBe(true)
    expect(issues.some((i) => i.data?.tildaRule === 'missing_width')).toBe(false)
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
