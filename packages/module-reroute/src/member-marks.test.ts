import { describe, expect, test } from 'bun:test'
import { memberMarks } from './member-marks.ts'

describe('memberMarks', () => {
  test('no change: no marks', () => {
    expect(memberMarks('r1', ['w1', 'w2'], ['w1', 'w2'])).toEqual({
      relationId: 'r1',
      added: [],
      removed: [],
    })
  })

  test('a stretch replaced: the new ways added, the old ones after the member before them', () => {
    expect(memberMarks('r1', ['w1', 'w2', 'w3', 'w4'], ['w1', 'w8', 'w9', 'w4'])).toEqual({
      relationId: 'r1',
      added: ['w8', 'w9'],
      removed: [
        { id: 'w2', after: 'w1' },
        { id: 'w3', after: 'w1' },
      ],
    })
  })

  test('the first member gone: at the top; a way twice in the route is one mark', () => {
    expect(memberMarks('r1', ['w1', 'w2', 'w1'], ['w2'])).toEqual({
      relationId: 'r1',
      added: [],
      removed: [{ id: 'w1', after: undefined }],
    })
  })
})
