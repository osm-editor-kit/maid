import { describe, expect, it } from 'bun:test'
import {
  nextParentRelationsSupport,
  parentRelationsPath,
  shouldAskParentRelations,
} from './parent-relations.ts'

describe('parentRelationsPath', () => {
  it('builds the route of iD loadEntityRelations for each element type', () => {
    expect(parentRelationsPath('n3')).toBe('/api/0.6/node/3/relations.json')
    expect(parentRelationsPath('w12')).toBe('/api/0.6/way/12/relations.json')
    expect(parentRelationsPath('r4')).toBe('/api/0.6/relation/4/relations.json')
  })

  it('has no route for a new feature or a non-element id', () => {
    expect(parentRelationsPath('n-1')).toBeUndefined()
    expect(parentRelationsPath('w-7')).toBeUndefined()
    expect(parentRelationsPath('x5')).toBeUndefined()
    expect(parentRelationsPath('w12a')).toBeUndefined()
  })
})

describe('the memory of the route', () => {
  it('asks while the route is unknown or supported, and not once it is missing', () => {
    expect(shouldAskParentRelations('unknown')).toBe(true)
    expect(shouldAskParentRelations('supported')).toBe(true)
    expect(shouldAskParentRelations('missing')).toBe(false)
  })

  it('becomes supported on an answer and missing on a 404, for good', () => {
    expect(nextParentRelationsSupport('unknown', 'answered')).toBe('supported')
    expect(nextParentRelationsSupport('unknown', 'not-found')).toBe('missing')
    expect(nextParentRelationsSupport('supported', 'not-found')).toBe('missing')
    // a failure that is not a 404 (network, timeout, server error) keeps what was known
    expect(nextParentRelationsSupport('unknown', 'failed')).toBe('unknown')
    expect(nextParentRelationsSupport('supported', 'failed')).toBe('supported')
    expect(nextParentRelationsSupport('missing', 'failed')).toBe('missing')
  })
})
