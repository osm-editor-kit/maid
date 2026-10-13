import { describe, expect, it } from 'bun:test'
import { reasonWithoutNo } from './reason-without-no.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  reasonWithoutNo.validate(entity('w-2', tags), ruleContext())

describe('parking_reason_without_no', () => {
  it('flags a reason on a side that has parking, or no position', () => {
    const issues = run({
      highway: 'residential',
      'parking:left': 'lane',
      'parking:left:reason': 'narrow',
    })
    expect(issues.map((issue) => issue.id)).toEqual(['parking_reason_without_no:w-2:left'])
    expect(issues[0]?.message).toContain('parking:left:reason=narrow')
    expect(issues[0]?.fixes).toHaveLength(0)
    expect(run({ highway: 'residential', 'parking:right:reason': 'curve' })).toHaveLength(1)
  })

  it('accepts a reason with no, on the side or through both', () => {
    expect(
      run({ highway: 'residential', 'parking:left': 'no', 'parking:left:reason': 'narrow' }),
    ).toHaveLength(0)
    expect(
      run({ highway: 'residential', 'parking:both': 'no', 'parking:both:reason': 'curve' }),
    ).toHaveLength(0)
  })

  it('a reason for both sides is reported for the side that has parking', () => {
    const issues = run({
      highway: 'residential',
      'parking:left': 'no',
      'parking:right': 'lane',
      'parking:both:reason': 'construction',
    })
    expect(issues.map((issue) => issue.id)).toEqual(['parking_reason_without_no:w-2:right'])
    expect(issues[0]?.message).toContain('parking:both:reason=construction')
  })

  it('no without a reason is not reported: it is the normal tagging of a road without parking', () => {
    expect(run({ highway: 'residential', 'parking:both': 'no' })).toHaveLength(0)
  })
})
