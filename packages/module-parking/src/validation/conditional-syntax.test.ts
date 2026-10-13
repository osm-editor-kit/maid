import { describe, expect, it } from 'bun:test'
import { conditionalSyntax, isConditionValue } from './conditional-syntax.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  conditionalSyntax.validate(entity('w-5', tags), ruleContext())

describe('parking_conditional_syntax', () => {
  it('accepts value @ (condition), also stacked with ;', () => {
    expect(isConditionValue('no_stopping @ (Mo-Fr 06:00-16:00; Sa 07:00-16:00)')).toBe(true)
    expect(
      isConditionValue('loading_only @ (Mo-Fr 06:00-16:00); no_stopping @ (Sa 07:00-16:00)'),
    ).toBe(true)
  })

  it('flags a value without @ or with unbalanced parentheses', () => {
    expect(isConditionValue('no_stopping Mo-Fr 06:00-16:00')).toBe(false)
    expect(isConditionValue('no @ (Mo-Fr 06:00-16:00')).toBe(false)
  })

  it('checks the parking and amenity=parking conditional keys, and names the key', () => {
    const issues = run({
      'parking:right:restriction:conditional': 'no_stopping (Mo-Fr 06:00-16:00)',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain(
      'parking:right:restriction:conditional=no_stopping (Mo-Fr 06:00-16:00)',
    )
    expect(run({ amenity: 'parking', 'access:conditional': 'no' })).toHaveLength(1)
    expect(run({ highway: 'residential', 'maxspeed:conditional': 'no' })).toHaveLength(0)
  })
})
