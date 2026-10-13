// Adopted from iD test/spec/validations/osm_api_limits.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import { graphOf, node, validateChanged, way } from '../id-test-helpers.ts'
import { createOsmApiLimits, longTags, osmApiLimits } from './osm-api-limits.ts'

// iD's spec sets the API's maximum to 10 nodes per way (`maxWayNodes = () => 10`). Maid's rule
// takes its limit as an argument, so the tests build it with 10 too. Maid's Issue has no `type`
// or `subtype`: the rule is `issue.rule`, and the subtype is the message.

/** iD's createWay: `numNodes` nodes n-0 … and one way through them, all of them changed */
function createWay(numNodes: number) {
  const nodes = Array.from({ length: numNodes }, (_, i) => node(`n-${i}`, i, i))
  const graph = graphOf(
    ...nodes,
    way(
      'w-1',
      nodes.map((n) => n.id),
    ),
  )
  return { graph, ids: [...nodes.map((n) => n.id), 'w-1'] }
}

describe('iD.validations.osm_api_limits', () => {
  const rule = createOsmApiLimits(10)

  it('has no errors on init', () => {
    const issues = validateChanged(rule, graphOf(), [])
    expect(issues).toHaveLength(0)
  })

  // iD's test also checks the fix ("Split the way") and that the issue is gone after it. Maid has
  // no split operation in the validation package, so this test is a todo; the detection part is
  // checked by the Maid addition below.
  // needs F-validations-4
  it.todo('flags way with more than the maximum number of allowed nodes', () => {})

  // needs F-validations-4
  it.todo('can fix an extreme case', () => {})

  // needs F-validations-4
  it.todo('fix a simple case at an intersection vertex', () => {})

  // Maid addition, not in iD's spec: the detection part of the test above, with the same data.
  it('reports a way with 12 nodes as an error when the limit is 10 (detection only)', () => {
    const { graph, ids } = createWay(12)
    const issues = validateChanged(rule, graph, ids)
    expect(issues).toHaveLength(1)
    const issue = issues[0]
    expect(issue?.rule).toEqual('osm_api_limits')
    expect(issue?.message).toEqual(
      'This way has 12 nodes, more than the 10 the OSM API accepts in one way',
    )
    expect(issue?.severity).toEqual('error')
    expect(issue?.entityIds).toEqual(['w-1'])
    expect(issue?.fixes).toHaveLength(0)
  })

  // Maid addition: a way at the limit is fine, and the default limit is the API's documented 2000.
  it('accepts a way at the limit, and uses 2000 nodes by default (Maid addition)', () => {
    const atLimit = createWay(10)
    expect(validateChanged(rule, atLimit.graph, atLimit.ids)).toHaveLength(0)
    const big = createWay(2001)
    const issues = validateChanged(osmApiLimits, big.graph, big.ids)
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toEqual(
      'This way has 2001 nodes, more than the 2000 the OSM API accepts in one way',
    )
  })
})

// Maid addition: the API refuses a tag key or value of more than 255 characters (Unicode characters,
// not bytes). The rule reports one error per entity with its first long tag.
describe('tag keys and values longer than 255 characters (Maid addition)', () => {
  const rule = createOsmApiLimits(10)

  it('reports a value of 262 characters, naming the key and the lengths', () => {
    const graph = graphOf(node('n-1', 0, 0, { description: 'x'.repeat(262) }))
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toEqual(
      'The value of description is 262 characters long, the limit is 255',
    )
    expect(issues[0]?.severity).toEqual('error')
    expect(issues[0]?.entityIds).toEqual(['n-1'])
    expect(issues[0]?.id).toEqual('osm_api_limits:n-1:tags')
  })

  it('reports a key of 256 characters', () => {
    const key = 'k'.repeat(256)
    const graph = graphOf(node('n-1', 0, 0, { [key]: 'v' }))
    const issues = validateChanged(rule, graph, ['n-1'])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toEqual(`The key ${key} is 256 characters long, the limit is 255`)
  })

  it('accepts a value of exactly 255 characters, and a key of exactly 255', () => {
    const graph = graphOf(node('n-1', 0, 0, { ['k'.repeat(255)]: 'v'.repeat(255) }))
    expect(validateChanged(rule, graph, ['n-1'])).toHaveLength(0)
  })

  it('counts an emoji as one character', () => {
    // 255 emoji are 510 UTF-16 code units: a length count of code units would refuse them
    const graph = graphOf(node('n-1', 0, 0, { note: '😀'.repeat(255) }))
    expect(validateChanged(rule, graph, ['n-1'])).toHaveLength(0)
    const longer = graphOf(node('n-2', 0, 0, { note: '😀'.repeat(256) }))
    expect(validateChanged(rule, longer, ['n-2'])[0]?.message).toEqual(
      'The value of note is 256 characters long, the limit is 255',
    )
  })

  it('checks ways and relations too, and says how many more tags are too long', () => {
    const graph = graphOf(way('w-1', [], { a: 'x'.repeat(300), b: 'y'.repeat(256) }))
    const issues = validateChanged(rule, graph, ['w-1'])
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toEqual(
      'The value of a is 300 characters long, the limit is 255 (and 1 more too long)',
    )
  })

  it('lists every long key and value in the data', () => {
    expect(longTags({ a: 'x'.repeat(256), b: 'ok', ['c'.repeat(256)]: 'v' })).toEqual([
      { key: 'a', part: 'value', length: 256 },
      { key: 'c'.repeat(256), part: 'key', length: 256 },
    ])
  })

  it('the node limit and the tag limit are two issues of one way', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n-${i}`, i, i))
    const graph = graphOf(
      ...nodes,
      way(
        'w-1',
        nodes.map((n) => n.id),
        { description: 'x'.repeat(256) },
      ),
    )
    const issues = validateChanged(rule, graph, [...nodes.map((n) => n.id), 'w-1'])
    expect(issues.map((issue) => issue.id)).toEqual([
      'osm_api_limits:w-1',
      'osm_api_limits:w-1:tags',
    ])
  })
})
