// Adopted from iD test/spec/validations/incompatible_source.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import { incompatibleSource } from './incompatible-source.ts'

// Maid's Issue has no `type`: the rule is `issue.rule`. iD's reference text is in the message.

/** iD's createWay: three nodes and one way with these tags, all of them changed */
function createWay(tags: Record<string, string>) {
  const graph = graphOf(
    node('n-1', 4, 4),
    node('n-2', 4, 5),
    node('n-3', 5, 5),
    way('w-1', ['n-1', 'n-2', 'n-3'], tags),
  )
  return { graph, ids: ['n-1', 'n-2', 'n-3', 'w-1'] }
}

describe('iD.validations.incompatible_source', () => {
  const rule = incompatibleSource

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  it('ignores way with no source tag', () => {
    const { graph, ids } = createWay({
      amenity: 'cafe',
      building: 'yes',
      name: 'Key Largo Café',
    })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with okay source tag', () => {
    const { graph, ids } = createWay({
      amenity: 'cafe',
      building: 'yes',
      name: 'Key Largo Café',
      source: 'survey',
    })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('ignores way with excepted source tag', () => {
    const { graph, ids } = createWay({
      amenity: 'cafe',
      building: 'yes',
      name: 'Key Largo Café',
      source: 'Google drive',
    })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('flags way with incompatible source tag', () => {
    const { graph, ids } = createWay({
      amenity: 'cafe',
      building: 'yes',
      name: 'Key Largo Café',
      source: 'Google Maps',
    })
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('incompatible_source')
    expect(issue?.message).toEqual(
      'Lists "Google Maps" as a data source. Google products are proprietary and must not be used as references.',
    )
    expect(issue?.entityIds).toHaveLength(1)
    expect(issue?.entityIds[0]).toEqual('w-1')
  })

  it('does not flag buildings in the google-africa-buildings dataset', () => {
    const { graph, ids } = createWay({ building: 'yes', source: 'esri/Google_Africa_Buildings' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })

  it('does not flag buildings in the google-open-buildings dataset', () => {
    const { graph, ids } = createWay({ building: 'yes', source: 'esri/Google_Open_Buildings' })
    expect(validateChanged(rule, graph, ids)).toHaveLength(0)
  })
})
