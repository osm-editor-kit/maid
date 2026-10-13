import { describe, expect, it } from 'bun:test'
import { ignoredIssueIds, ignoredIssues, restoreIgnored } from './validation-ignored.ts'

describe('the stored ignored warnings', () => {
  it('uses a stored value that fits, and nothing else', () => {
    expect(restoreIgnored({ ids: ['a', 'b'] })).toEqual(['a', 'b'])
    expect(restoreIgnored({ ids: [1, 2] })).toEqual([])
    expect(restoreIgnored('not an object')).toEqual([])
    expect(restoreIgnored(undefined)).toEqual([])
  })

  it('keeps each id once, shows them again, and hands the validator the same set until they change', () => {
    ignoredIssues.showAgain()
    ignoredIssues.ignore('outdated_tags:w1:deprecated_tags:x')
    ignoredIssues.ignore('outdated_tags:w1:deprecated_tags:x')
    expect(ignoredIssues.getIds()).toEqual(['outdated_tags:w1:deprecated_tags:x'])
    const first = ignoredIssueIds()
    expect(ignoredIssueIds()).toBe(first)
    expect(first.has('outdated_tags:w1:deprecated_tags:x')).toBe(true)
    ignoredIssues.showAgain()
    expect(ignoredIssues.getIds()).toEqual([])
    expect(ignoredIssueIds().size).toBe(0)
  })
})
