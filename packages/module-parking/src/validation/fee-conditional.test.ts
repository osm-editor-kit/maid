import { describe, expect, it } from 'bun:test'
import { feeConditional } from './fee-conditional.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  feeConditional.validate(entity('w-7', tags), ruleContext())

describe('parking_fee_conditional', () => {
  it('flags fee=yes with a conditional fee of yes, without a fix', () => {
    const issues = run({
      'parking:right:fee': 'yes',
      'parking:right:fee:conditional': 'yes @ (Mo-Fr 09:00-18:00)',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('parking:right:fee=yes')
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('accepts fee=yes with a conditional fee of no', () => {
    expect(
      run({ 'parking:right:fee': 'yes', 'parking:right:fee:conditional': 'no @ (Sa 09:00-18:00)' }),
    ).toHaveLength(0)
  })
})
