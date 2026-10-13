import { describe, expect, it } from 'bun:test'
import { entity, ruleContext, tagsAfterFix, graphOf } from './test-helpers.ts'
import { semicolonBetweenGroups, weekdayComma } from './weekday-comma.ts'

describe('parking_weekday_comma', () => {
  it('replaces a comma between weekday groups with ;', () => {
    expect(semicolonBetweenGroups('loading_only @ (Mo-Fr 06:00-16:00, Sa 07:00-16:00)')).toBe(
      'loading_only @ (Mo-Fr 06:00-16:00; Sa 07:00-16:00)',
    )
  })

  it('keeps a comma between days of one group', () => {
    expect(semicolonBetweenGroups('no @ (Mo,We 08:00-12:00)')).toBe('no @ (Mo,We 08:00-12:00)')
  })

  it('flags the key and offers the replacement as a fix', () => {
    const tags = {
      'parking:right:restriction:conditional': 'loading_only @ (Mo-Fr 06:00-16:00, Sa 07:00-16:00)',
    }
    const made = entity('w-6', tags)
    const issues = weekdayComma.validate(made, ruleContext(graphOf(made)))
    expect(issues).toHaveLength(1)
    const fix = issues[0]?.fixes[0]
    expect(fix).toBeDefined()
    if (!fix) return
    const after = tagsAfterFix(fix, graphOf(made), 'w-6')
    expect(after['parking:right:restriction:conditional']).toBe(
      'loading_only @ (Mo-Fr 06:00-16:00; Sa 07:00-16:00)',
    )
  })
})
