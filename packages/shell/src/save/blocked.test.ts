import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode } from '@osm-editor-kit/maid-model'
import { createValidator, osmApiLimits, type Issue } from '@osm-editor-kit/maid-validation'
import { errorSentence, featureName, saveBlocked } from './blocked.ts'

const context = new ModelContext()

/** The errors of the OSM API limits rule on one changed node with these tags, as the save flyout gets them */
function errorsFor(tags: Record<string, string>, id = 'n-1'): Issue[] {
  const node = new OsmNode(context, { id, loc: [0, 0], tags })
  const validator = createValidator([osmApiLimits])
  validator.validate(new Graph(context, [node]), [id], [])
  return validator.issues().filter((issue) => issue.severity === 'error')
}

describe('featureName', () => {
  it('names an uploaded feature by its type and OSM id', () => {
    expect(featureName('n123')).toBe('node 123')
    expect(featureName('w7')).toBe('way 7')
    expect(featureName('r9')).toBe('relation 9')
  })

  it('names a feature that is not uploaded yet as new', () => {
    expect(featureName('w-1')).toBe('new way')
  })

  it('falls back to feature for an id it cannot read', () => {
    expect(featureName('x')).toBe('feature')
  })
})

describe('saveBlocked', () => {
  it('is blocked on a fixture, whatever else holds', () => {
    expect(saveBlocked({ source: 'fixture', loggedIn: true, errors: [] })).toContain('?live=dev')
  })

  it('is open when logged in on OpenStreetMap with no errors', () => {
    expect(saveBlocked({ source: 'osm', loggedIn: true, errors: [] })).toBeUndefined()
  })

  it('is blocked when logged out, and says so', () => {
    expect(saveBlocked({ source: 'dev', loggedIn: false, errors: [] })).toBe('Log in to save.')
  })

  it('is open when logged in on the development server with no errors', () => {
    expect(saveBlocked({ source: 'dev', loggedIn: true, errors: [] })).toBeUndefined()
  })

  it('is open when every tag is at most 255 characters, emoji included', () => {
    const errors = errorsFor({ note: 'a'.repeat(255), emoji: '😀'.repeat(255) })
    expect(saveBlocked({ source: 'dev', loggedIn: true, errors })).toBeUndefined()
  })

  it('is blocked by a value of 256 characters, and names the feature and the lengths', () => {
    const errors = errorsFor({ description: 'x'.repeat(262) })
    expect(saveBlocked({ source: 'dev', loggedIn: true, errors })).toBe(
      'A tag value is too long: shorten it before saving (new node). The value of description is 262 characters long, the limit is 255.',
    )
  })

  it('is blocked by a key that is too long, with a sentence about the key', () => {
    const key = 'k'.repeat(256)
    const errors = errorsFor({ [key]: 'v' }, 'n42')
    expect(saveBlocked({ source: 'dev', loggedIn: true, errors })).toBe(
      `A tag key is too long: shorten it before saving (node 42). The key ${key} is 256 characters long, the limit is 255.`,
    )
  })

  it('shows the error before the login, since the data has to be fixed either way', () => {
    const errors = errorsFor({ description: 'x'.repeat(256) })
    expect(saveBlocked({ source: 'dev', loggedIn: false, errors })).toStartWith(
      'A tag value is too long',
    )
  })
})

describe('errorSentence', () => {
  it('gives a sentence for any other error of the rule as its message', () => {
    const other: Issue = {
      id: 'osm_api_limits:w-1',
      rule: 'osm_api_limits',
      severity: 'error',
      message: 'This way has 2001 nodes, more than the 2000 the OSM API accepts in one way',
      entityIds: ['w-1'],
      fixes: [],
    }
    expect(errorSentence(other)).toBe(
      'This way has 2001 nodes, more than the 2000 the OSM API accepts in one way.',
    )
  })
})
