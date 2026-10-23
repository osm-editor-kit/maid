import { describe, expect, it } from 'bun:test'
import {
  COMMENT_LISTED,
  commentSuggestions,
  extraSourceOptions,
  hasSource,
  mergeRecent,
  SOURCE_CHIPS,
  SOURCE_OPTIONS,
  sourceChips,
  sourceField,
  sourceLabel,
  toggleSource,
} from './changeset-suggestions.ts'

describe('mergeRecent', () => {
  it("lists the own values first, then the server's, each once", () => {
    expect(mergeRecent(['b', 'a'], ['a', 'c', 'b', 'd'])).toEqual(['b', 'a', 'c', 'd'])
    expect(mergeRecent([], [])).toEqual([])
    expect(mergeRecent(['x'], [])).toEqual(['x'])
  })

  it('compares with case', () => {
    expect(mergeRecent(['GPS'], ['gps'])).toEqual(['GPS', 'gps'])
  })
})

describe('commentSuggestions', () => {
  const recent = ['Added benches in the park', 'Fixed a bench', 'Survey of fences', 'bench survey']

  it('offers the newest comments for an empty text', () => {
    expect(commentSuggestions(recent, '')).toEqual(recent)
    expect(commentSuggestions(recent, '   ')).toEqual(recent)
  })

  it('matches the text anywhere in a comment, with case', () => {
    expect(commentSuggestions(recent, 'bench')).toEqual([
      'Added benches in the park',
      'Fixed a bench',
      'bench survey',
    ])
    expect(commentSuggestions(recent, 'Bench')).toEqual([])
    expect(commentSuggestions(recent, 'Survey')).toEqual(['Survey of fences'])
  })

  it('does not offer what is typed already', () => {
    expect(commentSuggestions(recent, 'Fixed a bench')).toEqual([])
    expect(commentSuggestions(recent, 'Fixed a benc')).toEqual(['Fixed a bench'])
  })

  it('lists at most the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => `comment ${i}`)
    expect(commentSuggestions(many, '')).toHaveLength(COMMENT_LISTED)
    expect(commentSuggestions(many, 'comment', 3)).toEqual(['comment 0', 'comment 1', 'comment 2'])
  })
})

describe('the source as a list of toggles', () => {
  it('knows whether a value is in the source', () => {
    expect(hasSource('survey;gps', 'gps')).toBe(true)
    expect(hasSource('survey;gps', 'GPS')).toBe(false)
    expect(hasSource(undefined, 'gps')).toBe(false)
  })

  it('adds a value last and removes it again', () => {
    expect(toggleSource(undefined, 'survey')).toBe('survey')
    expect(toggleSource('survey', 'gps')).toBe('survey;gps')
    expect(toggleSource('survey;gps', 'survey')).toBe('gps')
    expect(toggleSource('survey', 'survey')).toBeUndefined()
  })

  it('cleans the list it writes: spaces, empty values and duplicates', () => {
    expect(toggleSource(' survey ; ;survey;', 'gps')).toBe('survey;gps')
    expect(toggleSource('survey; Bing aerial imagery', 'survey')).toBe('Bing aerial imagery')
  })

  it('shows the newest few as chips', () => {
    const many = Array.from({ length: 10 }, (_, i) => `s${i}`)
    expect(sourceChips(many)).toEqual(many.slice(0, SOURCE_CHIPS))
    expect(sourceChips(['a'])).toEqual(['a'])
  })
})

describe('the source field', () => {
  it('adds the recent sources that are no option yet, as iD does', () => {
    expect(extraSourceOptions(SOURCE_OPTIONS, ['survey', 'Bing aerial imagery', 'gps'])).toEqual([
      { value: 'Bing aerial imagery', label: 'Bing aerial imagery' },
    ])
  })

  it('is the schema field with the extras, keeping case and spaces', () => {
    const field = sourceField(undefined, ['survey', 'Mapillary'])
    expect(field).toMatchObject({
      key: 'source',
      type: 'semiCombo',
      caseSensitive: true,
      snakeCase: false,
    })
    expect(field.options.map((option) => option.value)).toEqual([
      ...SOURCE_OPTIONS.map((option) => option.value),
      'Mapillary',
    ])
  })

  it('takes the options of the schema when the presets are made', () => {
    const schema = {
      id: 'source',
      type: 'semiCombo',
      key: 'source',
      label: 'Sources',
      options: [{ value: 'survey', label: 'Survey' }],
      universal: false,
    }
    const field = sourceField(schema, ['gps'])
    expect(field.options).toEqual([
      { value: 'survey', label: 'Survey' },
      { value: 'gps', label: 'gps' },
    ])
    expect(sourceLabel(field, 'survey')).toBe('Survey')
    expect(sourceLabel(field, 'not an option')).toBe('not an option')
  })
})
