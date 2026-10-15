import { describe, expect, it } from 'bun:test'
import {
  cleanTagValue,
  commitDraft,
  DRAFT_TTL_MS,
  draftHashtags,
  findHashtags,
  hashtagsOfComment,
  hashtagsOfField,
  linksOf,
  parseStoredDraft,
  prefillDraft,
  TAG_VALUE_MAX,
  type StoredDraft,
} from './changeset-draft.ts'

const NOW = Date.UTC(2026, 9, 15, 12)
const HOUR = 3_600_000

describe('hashtagsOfField', () => {
  it('splits on commas, semicolons and spaces, adding the # a word lacks', () => {
    expect(hashtagsOfField('mapathon, berlin;#x  y')).toEqual(['#mapathon', '#berlin', '#x', '#y'])
  })

  it('keeps the first hashtag of a word that holds two', () => {
    expect(hashtagsOfField('#a#b')).toEqual(['#a'])
  })

  it('finds none in an empty value', () => {
    expect(hashtagsOfField('')).toEqual([])
  })
})

describe('hashtagsOfComment', () => {
  it('takes the hashtags and leaves the URLs out', () => {
    expect(hashtagsOfComment('Fixed http://x.org/#foo and #Bar!')).toEqual(['#Bar'])
  })

  it('reads the full-width hash too', () => {
    expect(hashtagsOfComment('＃Mapa')).toEqual(['＃Mapa'])
  })
})

describe('findHashtags', () => {
  it('keeps each tag once, without case, the first spelling', () => {
    expect(findHashtags({ comment: '#Berlin #berlin' }, true)).toEqual(['#Berlin'])
  })

  it('uses the hashtags value when the comment has none', () => {
    expect(findHashtags({ comment: 'no tags', hashtags: '#a' }, true)).toEqual(['#a'])
  })

  it('lets a comment with hashtags replace the hashtags value when only the comment changed', () => {
    expect(findHashtags({ comment: '#x', hashtags: '#a' }, true)).toEqual(['#x'])
  })

  it('adds the hashtags value to the comment when the comment is not the change', () => {
    expect(findHashtags({ comment: '#x', hashtags: '#a' }, false)).toEqual(['#x', '#a'])
  })
})

describe('draftHashtags', () => {
  it('gives the hashtags the comment has', () => {
    expect(draftHashtags({ comment: 'Paths #radnetz, #berlin' })).toBe('#radnetz;#berlin')
  })

  it('keeps the hashtags value for an empty comment', () => {
    expect(draftHashtags({ comment: '', hashtags: '#a' })).toBe('#a')
  })

  it('gives none when there are none', () => {
    expect(draftHashtags({ comment: 'plain' })).toBeUndefined()
  })
})

describe('cleanTagValue', () => {
  it('trims, normalises to NFC and cuts to the tag limit', () => {
    expect(cleanTagValue('  é  ')).toBe('é')
    expect(Array.from(cleanTagValue('a'.repeat(300))).length).toBe(TAG_VALUE_MAX)
  })
})

describe('linksOf', () => {
  it('keeps only the values the address has, cleaned', () => {
    expect(linksOf({ comment: '  Mapped  ', hashtags: '  ', source: null })).toEqual({
      comment: 'Mapped',
    })
  })
})

describe('prefillDraft', () => {
  it('takes the links when nothing is stored, and the comment decides the hashtags', () => {
    const draft = prefillDraft(
      undefined,
      { comment: 'Mapped #x', hashtags: 'a,b', source: 'survey' },
      NOW,
    )
    expect(draft).toEqual({
      comment: 'Mapped #x',
      hashtags: undefined,
      source: 'survey',
      commentDate: NOW,
    })
  })

  it('lets a link comment replace a stored comment and keeps the stored hashtags', () => {
    const stored: StoredDraft = {
      comment: 'old',
      hashtags: '#old',
      commentDate: NOW - HOUR,
    }
    const draft = prefillDraft(stored, { comment: 'new' }, NOW)
    expect(draft).toEqual({ comment: 'new', hashtags: '#old', source: undefined, commentDate: NOW })
  })

  it('keeps a fresh stored draft when no link is given', () => {
    const stored: StoredDraft = { comment: 'kept', source: 'survey', commentDate: NOW - HOUR }
    expect(prefillDraft(stored, {}, NOW)).toEqual(stored)
  })

  it('drops a stored draft older than two days', () => {
    const stored: StoredDraft = { comment: 'old', commentDate: NOW - DRAFT_TTL_MS - HOUR }
    expect(prefillDraft(stored, {}, NOW)).toEqual({ comment: '', commentDate: 0 })
  })

  it('drops a stored draft dated in the future', () => {
    const stored: StoredDraft = { comment: 'future', commentDate: NOW + HOUR }
    expect(prefillDraft(stored, {}, NOW).comment).toBe('')
  })
})

describe('commitDraft', () => {
  it('cleans the values and recomputes the hashtags from the comment', () => {
    expect(commitDraft({ comment: '  Added #cafe  ', source: '  ', hashtags: '#stale' })).toEqual({
      comment: 'Added #cafe',
      hashtags: '#cafe',
    })
  })

  it('keeps the source when there is one', () => {
    expect(commitDraft({ comment: 'Added', source: ' survey ' })).toEqual({
      comment: 'Added',
      source: 'survey',
    })
  })
})

describe('parseStoredDraft', () => {
  it('reads a stored draft', () => {
    expect(parseStoredDraft('{"comment":"Mapped","commentDate":5}')).toEqual({
      comment: 'Mapped',
      commentDate: 5,
    })
  })

  it('reads nothing from a value that does not fit', () => {
    expect(parseStoredDraft(null)).toBeUndefined()
    expect(parseStoredDraft('not json')).toBeUndefined()
    expect(parseStoredDraft('{"comment":3,"commentDate":5}')).toBeUndefined()
    expect(parseStoredDraft('{"comment":"x"}')).toBeUndefined()
  })
})
