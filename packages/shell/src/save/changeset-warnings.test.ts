import { describe, expect, it } from 'bun:test'
import { changesetWarnings, warningsFor } from './changeset-warnings.ts'

describe('the warnings under the comment and the source', () => {
  it('say what was mentioned and where, as iD does', () => {
    const [warning] = warningsFor('comment', 'Added shops from Google Maps')
    expect(warning?.id).toBe('comment.google')
    expect(warning?.text).toStartWith('You mentioned "Google" in this changeset comment.')
    const [source] = warningsFor('source', 'survey;Google Street View')
    expect(source?.text).toStartWith('You mentioned "Google" as a source of this changeset.')
  })

  it('name each product once', () => {
    expect(warningsFor('source', 'baidu;google maps').map((w) => w.id)).toEqual([
      'source.baidu',
      'source.google',
    ])
  })

  it('are empty for a harmless text, and for no text', () => {
    expect(warningsFor('comment', 'Added benches')).toEqual([])
    expect(warningsFor('source', undefined)).toEqual([])
    expect(changesetWarnings({ comment: 'ok', source: 'survey' })).toEqual({
      comment: [],
      source: [],
    })
  })

  it('look at the comment and the source of a draft apart', () => {
    const warnings = changesetWarnings({ comment: 'from google', source: 'survey' })
    expect(warnings.comment).toHaveLength(1)
    expect(warnings.source).toEqual([])
  })
})
