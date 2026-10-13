// Adopted from iD test/spec/validations/outdated_tags.js (ISC, © iD contributors), at commit 0194f3926.
// The schema's deprecated list is replaced by iD's list of the spec (as iD's spec sets its fileFetcher cache), and the
// presets are the real ones of the tagging schema. Maid's issue has no `type` and `subtype`: the rule is `issue.rule`,
// the subtype is `data.subtype`, and the tag diff of iD's reference is `data.tagDiff`.
import { beforeAll, describe, expect, it } from 'bun:test'
import { Graph } from '@osm-editor-kit/maid-model'
// The presets package is not linked into this package's node_modules (that needs a bun install), so the source is
// imported by its path: its schema data is found from the presets package, as the app's own presets are.
import { defaultPresetData } from '../../../presets/src/default.ts'
import { createPresets } from '../../../presets/src/presets.ts'
import type { Presets } from '../../../presets/src/types.ts'
import { dataOf, graphOf, node, relation, validateChanged, way } from '../id-test-helpers.ts'
import type { Scene } from '../id-test-helpers.ts'
import type { Issue } from '../types.ts'
import { outdatedTags } from './outdated-tags.ts'

/** iD's spec list of deprecated tags */
const iDDeprecated = [
  { old: { building: 'roof' }, replace: { building: 'roof', layer: '1' } },
  { old: { highway: 'no' } },
  { old: { highway: 'ford' }, replace: { ford: '*' } },
  { old: { amenity: 'bench', capacity: '*' }, replace: { amenity: 'bench', seats: '$1' } },
  { old: { oldKey1: '*', oldKey2: '*' }, replace: { newKey1: '$1', newKey2: '$2' } },
]

let presets: Presets

beforeAll(() => {
  presets = createPresets({ ...defaultPresetData, deprecated: iDDeprecated })
})

/** iD's createWay: a way of two nodes, the scene of the spec */
function wayScene(tags: Record<string, string>): Scene {
  return {
    graph: graphOf(node('n-1', 4, 4), node('n-2', 4, 5), way('w-1', ['n-1', 'n-2'], tags)),
    ids: ['n-1', 'n-2', 'w-1'],
  }
}

/** iD's createRelation: a multipolygon of one way, with these tags on the way and on the relation */
function relationScene(
  wayTags: Record<string, string>,
  relationTags: Record<string, string>,
): Scene {
  return {
    graph: graphOf(
      node('n-1', 4, 4),
      node('n-2', 4, 5),
      node('n-3', 5, 5),
      way('w-1', ['n-1', 'n-2', 'n-3', 'n-1'], wayTags),
      relation('r-1', [{ id: 'w-1', type: 'way', role: '' }], relationTags),
    ),
    ids: ['n-1', 'n-2', 'n-3', 'w-1', 'r-1'],
  }
}

/** The issues of the rule over a scene, with the presets of this file */
function issuesOf(scene: Scene): Issue[] {
  return validateChanged(outdatedTags, scene.graph, scene.ids, presets)
}

/** The tags after the first fix of an issue is applied, as the history applies it (one change) */
function tagsAfterFix(scene: Scene, issue: Issue | undefined) {
  const fix = issue?.fixes[0]
  if (!fix) throw new Error('the issue has no fix')
  // the actions run on a working graph, as the history gives them (the scene's graph is a base graph)
  const working = new Graph(scene.graph)
  const after = fix.actions(working).reduce((graph, action) => action(graph), working)
  return after.hasEntity('w-1')?.tags
}

describe('iD.validations.outdated_tags', () => {
  it('has no errors on init', () => {
    expect(validateChanged(outdatedTags, graphOf(), [], presets)).toHaveLength(0)
  })

  it('has no errors on good tags', () => {
    expect(issuesOf(wayScene({ highway: 'unclassified' }))).toHaveLength(0)
  })

  it('flags deprecated tag with replacement', () => {
    const issues = issuesOf(wayScene({ highway: 'ford' }))
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(issue?.rule).toBe('outdated_tags')
    expect(dataOf(issue).subtype).toBe('deprecated_tags')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['w-1'])
  })

  it('flags deprecated tag with no replacement', () => {
    const issues = issuesOf(wayScene({ highway: 'no' }))
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(issue?.rule).toBe('outdated_tags')
    expect(dataOf(issue).subtype).toBe('deprecated_tags')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['w-1'])
  })

  it('flags deprecated tag with transfer replacement', () => {
    const scene = wayScene({ amenity: 'bench', capacity: '4' })
    const issues = issuesOf(scene)
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(issue?.rule).toBe('outdated_tags')
    expect(dataOf(issue).subtype).toBe('deprecated_tags')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(tagsAfterFix(scene, issue)).toStrictEqual({ amenity: 'bench', seats: '4' })
  })

  it('flags deprecated tag with multiple transfer tags', () => {
    const scene = wayScene({ oldKey1: 'foo', oldKey2: 'bar' })
    const issues = issuesOf(scene)
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(issue?.rule).toBe('outdated_tags')
    expect(dataOf(issue).subtype).toBe('deprecated_tags')
    expect(issue?.severity).toBe('warning')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(tagsAfterFix(scene, issue)).toStrictEqual({ newKey1: 'foo', newKey2: 'bar' })
  })

  it('ignores way with no relations', () => {
    expect(issuesOf(wayScene({}))).toHaveLength(0)
  })

  it('ignores multipolygon tagged on the relation', () => {
    expect(issuesOf(relationScene({}, { type: 'multipolygon', building: 'yes' }))).toHaveLength(0)
  })

  // needs NSI: the name-suggestion-index is not ported (noncanonical_brand). iD's expectations: 1 issue, subtype
  // noncanonical_brand, and the brand:wikidata added by its fix.
  it.todo('flags suggestions from NSI', () => {})

  // The deprecated half of iD's test. The NSI half (the second issue, noncanonical_brand) is not ported.
  it('generates the deprecated issue for ford, amenity and brand (the NSI issue not ported)', () => {
    const scene = wayScene({ highway: 'ford', amenity: 'fast_food', brand: 'Fish Bowl' })
    const issues = issuesOf(scene)
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(dataOf(issue).subtype).toBe('deprecated_tags')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(tagsAfterFix(scene, issue)).toStrictEqual({
      amenity: 'fast_food',
      brand: 'Fish Bowl',
      ford: 'yes',
    })
  })

  it('includes unchanged context tags of deprecation rule in tag reference', () => {
    const issues = issuesOf(wayScene({ building: 'roof' }))
    expect(issues).toHaveLength(1)
    const diff = dataOf(issues[0]).tagDiff as { type: string; key: string }[]
    expect(diff).toHaveLength(2)
    expect(diff.some((change) => change.type === '+' && change.key === 'layer')).toBeTruthy()
    expect(diff.some((change) => change.type === '~' && change.key === 'building')).toBeTruthy()
  })

  it('does not raise an error in valid situations', () => {
    expect(issuesOf(wayScene({ building: 'roof', layer: '1' }))).toHaveLength(0)
  })

  // The incomplete half of iD's test: the tags that the deprecation adds are reported as incomplete. The NSI half
  // (noncanonical_brand) is not ported.
  it('generates the incomplete issue for building roof, amenity and brand (the NSI issue not ported)', () => {
    const scene = wayScene({ building: 'roof', amenity: 'fast_food', brand: 'Fish Bowl' })
    const issues = issuesOf(scene)
    expect(issues).toHaveLength(1)
    const [issue] = issues
    expect(dataOf(issue).subtype).toBe('incomplete_tags')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(tagsAfterFix(scene, issue)).toStrictEqual({
      amenity: 'fast_food',
      brand: 'Fish Bowl',
      building: 'roof',
      layer: '1',
    })
  })
})
