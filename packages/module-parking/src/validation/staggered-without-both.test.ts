import { describe, expect, it } from 'bun:test'
import { staggeredWithoutBoth } from './staggered-without-both.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  staggeredWithoutBoth.validate(entity('w-8', tags), ruleContext())

describe('parking_staggered_without_both', () => {
  it('flags staggered=yes without parking:both', () => {
    const issues = run({ highway: 'residential', 'parking:both:staggered': 'yes' })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('parking:both:staggered=yes without parking:both')
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('accepts staggered with parking:both', () => {
    expect(run({ 'parking:both': 'street_side', 'parking:both:staggered': 'yes' })).toHaveLength(0)
  })
})
