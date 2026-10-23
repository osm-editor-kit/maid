import { describe, expect, it } from 'bun:test'
import {
  addRecent,
  COMMENT_CAP,
  EMPTY_HISTORY,
  parseHistory,
  remember,
  serializeHistory,
  SOURCE_CAP,
  sourceValues,
} from './changeset-history.ts'

describe('sourceValues', () => {
  it('splits at ";", cleans each value and drops the empty ones', () => {
    expect(sourceValues(' survey ; ;gps;')).toEqual(['survey', 'gps'])
    expect(sourceValues(undefined)).toEqual([])
    expect(sourceValues('')).toEqual([])
  })

  it('keeps each value once, in the order written, and keeps its case', () => {
    expect(sourceValues('survey;GPS;survey;gps')).toEqual(['survey', 'GPS', 'gps'])
  })
})

describe('addRecent', () => {
  it('puts the new values in front, each once: the new place wins', () => {
    expect(addRecent(['a', 'b', 'c'], ['c', 'd'], 10)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('cuts the list to the cap, dropping the oldest', () => {
    expect(addRecent(['a', 'b', 'c'], ['d'], 3)).toEqual(['d', 'a', 'b'])
  })
})

describe('remember', () => {
  it('adds the comment and each source value, most recent first', () => {
    const first = remember(EMPTY_HISTORY, { comment: 'Added a bench', source: 'survey;gps' })
    expect(first).toEqual({ comments: ['Added a bench'], sources: ['survey', 'gps'] })
    const second = remember(first, { comment: 'Fixed a fence', source: 'aerial imagery' })
    expect(second.comments).toEqual(['Fixed a fence', 'Added a bench'])
    expect(second.sources).toEqual(['aerial imagery', 'survey', 'gps'])
  })

  it('moves a comment that is used again to the front instead of listing it twice', () => {
    const history = { comments: ['b', 'a'], sources: ['x', 'y'] }
    expect(remember(history, { comment: 'a', source: 'y' })).toEqual({
      comments: ['a', 'b'],
      sources: ['y', 'x'],
    })
  })

  it('treats a differing case as another comment, as iD does', () => {
    const history = remember({ comments: ['Survey'], sources: [] }, { comment: 'survey' })
    expect(history.comments).toEqual(['survey', 'Survey'])
  })

  it('cleans the comment, and adds nothing for an empty comment or no source', () => {
    expect(remember(EMPTY_HISTORY, { comment: '  Tidied   ' }).comments).toEqual(['Tidied'])
    expect(remember(EMPTY_HISTORY, { comment: '   ' })).toEqual(EMPTY_HISTORY)
  })

  it('keeps at most the cap of comments and of sources', () => {
    let history = EMPTY_HISTORY
    for (let i = 0; i < COMMENT_CAP + 5; i++) {
      history = remember(history, { comment: `comment ${i}`, source: `source ${i}` })
    }
    expect(history.comments).toHaveLength(COMMENT_CAP)
    expect(history.comments[0]).toBe(`comment ${COMMENT_CAP + 4}`)
    expect(history.sources).toHaveLength(Math.min(SOURCE_CAP, COMMENT_CAP + 5))
  })
})

describe('the stored history', () => {
  it('survives a round trip with its version', () => {
    const history = { comments: ['a', 'b'], sources: ['survey'] }
    const text = serializeHistory(history)
    expect(JSON.parse(text)).toMatchObject({ v: 1 })
    expect(parseHistory(text)).toEqual(history)
  })

  it('is empty for nothing, for text that is not JSON, and for another shape or version', () => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY)
    expect(parseHistory('{not json')).toEqual(EMPTY_HISTORY)
    expect(parseHistory('{"comments":["a"],"sources":[]}')).toEqual(EMPTY_HISTORY)
    expect(parseHistory('{"v":2,"comments":["a"],"sources":[]}')).toEqual(EMPTY_HISTORY)
    expect(parseHistory('{"v":1,"comments":[1],"sources":[]}')).toEqual(EMPTY_HISTORY)
  })

  it('is read through the rules again: no duplicates, no empty values, the caps', () => {
    const comments = ['a', 'a', ' ', ...Array.from({ length: 40 }, (_, i) => `c${i}`)]
    const parsed = parseHistory(JSON.stringify({ v: 1, comments, sources: ['', 'x', 'x'] }))
    expect(parsed.comments).toHaveLength(COMMENT_CAP)
    expect(parsed.comments.slice(0, 2)).toEqual(['a', 'c0'])
    expect(parsed.sources).toEqual(['x'])
  })
})
