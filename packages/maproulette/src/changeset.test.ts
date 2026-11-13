import { describe, expect, test } from 'bun:test'
import {
  applyMapRouletteChangesetTags,
  buildSuggestedComment,
  closedTagKey,
  joinTaskIds,
} from './changeset.ts'

describe('closedTagKey', () => {
  test('one key per outcome; Fixed and anything else is closed:maproulette', () => {
    expect(closedTagKey(1)).toBe('closed:maproulette')
    expect(closedTagKey(2)).toBe('closed:maproulette:false_positive')
    expect(closedTagKey(5)).toBe('closed:maproulette:already_fixed')
    expect(closedTagKey(6)).toBe('closed:maproulette:too_hard')
    expect(closedTagKey(3)).toBe('closed:maproulette')
  })
})

describe('buildSuggestedComment', () => {
  test('joins unique comments with newlines when they fit', () => {
    expect(buildSuggestedComment(['One', 'Two', 'One', ' '], 255)).toBe('One\nTwo')
    expect(buildSuggestedComment([], 255)).toBe('')
  })

  test('packs whole comments under the maximum', () => {
    const [a, b, c] = ['A'.repeat(100), 'B'.repeat(100), 'C'.repeat(100)] as [
      string,
      string,
      string,
    ]
    const result = buildSuggestedComment([a, b, c], 255)
    expect(result.length).toBeLessThanOrEqual(255)
    expect(result).toContain(a)
    expect(result).toContain(b)
    expect(result).not.toContain(c)
  })

  test('cuts the first one when even that is too long', () => {
    expect(buildSuggestedComment(['X'.repeat(300)], 255)).toHaveLength(255)
  })
})

describe('joinTaskIds', () => {
  test('joins, drops repeats, and stops at whole ids', () => {
    expect(joinTaskIds(['1', '2', '2', ' ', '3'])).toBe('1;2;3')
    expect(joinTaskIds(['111', '222', '333'], 8)).toBe('111;222')
    expect(joinTaskIds([])).toBe('')
  })
})

describe('applyMapRouletteChangesetTags', () => {
  const challenge = {
    checkinComment: 'Fixed {{name}} (MR)',
    checkinSource: 'Survey',
  }
  const task = {
    title: 'w1@0',
    geometries: { features: [{ properties: { name: 'Elm Street' } }] },
  }

  test('comment, source, hashtag and closed tags', () => {
    const { tags, autoComment } = applyMapRouletteChangesetTags({
      tags: { created_by: 'Maid' },
      tasks: [
        { taskId: 1, status: 1, challenge, task },
        { taskId: 2, status: 1, challenge: null },
        { taskId: 3, status: 5 },
        { taskId: 4, status: 2 },
        { taskId: 5, status: 6 },
      ],
    })
    expect(tags).toEqual({
      created_by: 'Maid',
      'closed:maproulette': '1;2',
      'closed:maproulette:already_fixed': '3',
      'closed:maproulette:false_positive': '4',
      'closed:maproulette:too_hard': '5',
      comment: 'Fixed Elm Street (MR)',
      source: 'Survey',
      hashtags: '#maproulette',
    })
    expect(autoComment).toBe('Fixed Elm Street (MR)')
  })

  test('the hashtag is added once and the source merged', () => {
    const { tags } = applyMapRouletteChangesetTags({
      tags: { hashtags: '#a;#maproulette', source: 'Bing; Survey' },
      tasks: [{ taskId: 1, status: 1, challenge }],
    })
    expect(tags.hashtags).toBe('#a;#maproulette')
    expect(tags.source).toBe('Bing;Survey')
  })

  test('the mapper own comment stays; the last automatic one is replaced; the input is not changed', () => {
    const mine = { comment: 'My words' }
    const kept = applyMapRouletteChangesetTags({
      tags: mine,
      tasks: [{ taskId: 1, status: 1, challenge }],
      lastAutoComment: 'old',
    })
    expect(kept.tags.comment).toBe('My words')
    expect(kept.autoComment).toBe('old')
    expect(mine).toEqual({ comment: 'My words' })

    const replaced = applyMapRouletteChangesetTags({
      tags: { comment: 'old' },
      tasks: [{ taskId: 1, status: 1, challenge }],
      lastAutoComment: 'old',
    })
    expect(replaced.tags.comment).toBe('Fixed  (MR)')
  })

  test('old closed tags are removed; no task adds nothing else', () => {
    const { tags, autoComment } = applyMapRouletteChangesetTags({
      tags: { 'closed:maproulette': '9', comment: 'x' },
      tasks: [],
    })
    expect(tags).toEqual({ comment: 'x' })
    expect(autoComment).toBeNull()
  })

  test('a custom cleaner and the maximum length', () => {
    const { tags } = applyMapRouletteChangesetTags({
      tags: {},
      tasks: [
        { taskId: 111, status: 1 },
        { taskId: 222, status: 1 },
      ],
      maxChars: 5,
      cleanTagValue: (v) => `[${v}]`,
    })
    expect(tags['closed:maproulette']).toBe('[111]')
  })
})
