import { describe, expect, it } from 'bun:test'
import { challengeOfInput, parseAsMapRouletteLink } from './url.ts'

describe('maproulette parameter', () => {
  it('reads a challenge, a challenge with a task, and a task alone', () => {
    expect(parseAsMapRouletteLink.parse('9001')).toEqual({ challengeId: '9001', taskId: null })
    expect(parseAsMapRouletteLink.parse('9001/190003')).toEqual({
      challengeId: '9001',
      taskId: '190003',
    })
    expect(parseAsMapRouletteLink.parse('/190003')).toEqual({ challengeId: null, taskId: '190003' })
  })

  it("takes the first challenge of iD's list and drops what is not an id", () => {
    expect(parseAsMapRouletteLink.parse('12,34')).toEqual({ challengeId: '12', taskId: null })
    expect(parseAsMapRouletteLink.parse('true')).toBeNull()
    expect(parseAsMapRouletteLink.parse('x/y')).toBeNull()
  })

  it('writes what it reads', () => {
    for (const value of ['9001', '9001/190003', '/190003'])
      expect(parseAsMapRouletteLink.serialize(parseAsMapRouletteLink.parse(value)!)).toBe(value)
  })
})

describe('challenge input', () => {
  it('takes a number or a MapRoulette link', () => {
    expect(challengeOfInput(' 9001 ')).toEqual({ challengeId: '9001', taskId: null })
    expect(challengeOfInput('https://maproulette.org/browse/challenges/9001')).toEqual({
      challengeId: '9001',
      taskId: null,
    })
    expect(challengeOfInput('https://maproulette.org/challenge/9001/task/190003')).toEqual({
      challengeId: '9001',
      taskId: '190003',
    })
    expect(challengeOfInput('footways')).toBeNull()
  })
})
