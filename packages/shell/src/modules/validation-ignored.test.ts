import { describe, expect, it } from 'bun:test'
import {
  getIgnoredIds,
  ignoreIssue,
  ignoredIssueIds,
  restoreIgnored,
  showAgainIssues,
} from './validation-ignored.ts'

describe('the stored ignored warnings', () => {
  it('uses a stored value that fits, and nothing else', () => {
    expect(restoreIgnored({ ids: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(restoreIgnored({ ids: [1, 2] })).toEqual([])
    expect(restoreIgnored('not an object')).toEqual([])
    expect(restoreIgnored(undefined)).toEqual([])
  })

  it('keeps each id once, shows them again, and hands the validator the same set until they change', () => {
    showAgainIssues()
    ignoreIssue('outdated_tags:w1:deprecated_tags:x')
    ignoreIssue('outdated_tags:w1:deprecated_tags:x')
    expect(getIgnoredIds()).toEqual(['outdated_tags:w1:deprecated_tags:x'])
    const first = ignoredIssueIds()
    expect(ignoredIssueIds()).toBe(first)
    expect(first.has('outdated_tags:w1:deprecated_tags:x')).toBe(true)
    showAgainIssues()
    expect(getIgnoredIds()).toEqual([])
    expect(ignoredIssueIds().size).toBe(0)
  })
})
