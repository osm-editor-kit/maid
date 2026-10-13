import { describe, expect, it } from 'bun:test'
import { shoulderWithoutInformal } from './shoulder-informal.ts'
import { entity, graphOf, ruleContext, tagsAfterFix } from './test-helpers.ts'

const run = (made: ReturnType<typeof entity>) =>
  shoulderWithoutInformal.validate(made, ruleContext(graphOf(made)))

describe('parking_shoulder_without_informal', () => {
  it('flags a shoulder without informal=yes, and the fix adds it', () => {
    const made = entity('w-9', { highway: 'tertiary', 'parking:left': 'shoulder' })
    const issues = run(made)
    expect(issues).toHaveLength(1)
    const fix = issues[0]?.fixes[0]
    expect(fix).toBeDefined()
    if (!fix) return
    expect(tagsAfterFix(fix, graphOf(made), 'w-9')['parking:left:informal']).toBe('yes')
  })

  it('accepts shoulder with informal=yes on the side', () => {
    expect(
      run(entity('w-9', { 'parking:left': 'shoulder', 'parking:left:informal': 'yes' })),
    ).toHaveLength(0)
  })

  it('reports a shoulder given on both sides once, on the both key', () => {
    const issues = run(entity('w-9', { 'parking:both': 'shoulder' }))
    expect(issues.map((issue) => issue.id)).toEqual(['parking_shoulder_without_informal:w-9:both'])
  })
})
