import { describe, expect, test } from 'bun:test'
import { MapRouletteError } from './client.ts'
import {
  COMMENT_MAX_LENGTH,
  COMPLETION_ACTIONS,
  classifySubmitError,
  effectiveUpdateTiming,
  isAuthError,
  isCommentTooLong,
  parseUpdateTiming,
  preferredShowOsmId,
  shouldClearHiddenComment,
  shouldHideFixedAction,
  stripEmptyCompletionResponses,
} from './completion.ts'

describe('completion', () => {
  test('the four buttons in the order of MapRoulette', () => {
    expect(COMPLETION_ACTIONS.map((a) => [a.key, a.status])).toEqual([
      ['fixed', 1],
      ['alreadyFixed', 5],
      ['notAnIssue', 2],
      ['cantComplete', 6],
    ])
  })

  test('timing', () => {
    expect(parseUpdateTiming('right_away')).toBe('right_away')
    expect(parseUpdateTiming('x')).toBe('with_save')
    expect(parseUpdateTiming(undefined)).toBe('with_save')
    expect(effectiveUpdateTiming(true, 'right_away')).toBe('with_save')
    expect(effectiveUpdateTiming(false, 'right_away')).toBe('right_away')
    expect(shouldClearHiddenComment('with_save')).toBe(true)
    expect(shouldClearHiddenComment('right_away')).toBe(false)
  })

  test('comment length', () => {
    expect(isCommentTooLong('a'.repeat(COMMENT_MAX_LENGTH))).toBe(false)
    expect(isCommentTooLong('a'.repeat(COMMENT_MAX_LENGTH + 1))).toBe(true)
    expect(isCommentTooLong(null)).toBe(false)
  })

  test('empty responses', () => {
    expect(stripEmptyCompletionResponses({})).toBeUndefined()
    expect(stripEmptyCompletionResponses(null)).toBeUndefined()
    expect(stripEmptyCompletionResponses({ a: 1 })).toEqual({ a: 1 })
    expect(shouldHideFixedAction(true, true)).toBe(true)
    expect(shouldHideFixedAction(true, false)).toBe(false)
  })

  test('auth errors', () => {
    expect(isAuthError(new MapRouletteError('unauthorized', 'x', 401))).toBe(true)
    expect(isAuthError({ status: 401 })).toBe(true)
    expect(isAuthError({ status: 403, body: { status: 'NotAuthorized' } })).toBe(true)
    expect(isAuthError(new MapRouletteError('http', 'x', 500))).toBe(false)
    expect(isAuthError(null)).toBe(false)
  })

  test('error kinds', () => {
    expect(classifySubmitError(new MapRouletteError('timeout', 'x'))).toBe('timeout')
    expect(classifySubmitError(new MapRouletteError('inflight', 'x'))).toBe('inflight')
    expect(classifySubmitError(new MapRouletteError('http', 'x', 500))).toBe('http')
    expect(classifySubmitError(new MapRouletteError('unauthorized', 'x', 401))).toBe('http')
    expect(classifySubmitError(new MapRouletteError('network', 'x'))).toBe('network')
    expect(classifySubmitError(new Error('x'))).toBe('generic')
    expect(classifySubmitError(null)).toBe('generic')
  })

  test('which entity to show first', () => {
    expect(preferredShowOsmId(['r1', 'n2', 'w3'])).toBe('w3')
    expect(preferredShowOsmId(['r1', 'n2'])).toBe('n2')
    expect(preferredShowOsmId([])).toBeNull()
  })
})
