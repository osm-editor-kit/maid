import { describe, expect, it } from 'bun:test'
import { bothConflictsSide, splitBoth } from './both-side-conflict.ts'
import { entity, graphOf, ruleContext, tagsAfterFix } from './test-helpers.ts'

describe('parking_both_conflicts_side', () => {
  it('flags both and one side of the same suffix, with a split fix', () => {
    const made = entity('w-3', {
      highway: 'residential',
      'parking:both:fee': 'yes',
      'parking:left:fee': 'no',
    })
    const issues = bothConflictsSide.validate(made, ruleContext())
    expect(issues).toHaveLength(1)
    expect(issues[0]?.message).toContain('parking:both:fee=yes, parking:left:fee=no')
    expect(issues[0]?.fixes.map((fix) => fix.id)).toEqual(['split_both'])
  })

  it('flags the bare key against a side', () => {
    const issues = bothConflictsSide.validate(
      entity('w-3', { 'parking:both': 'lane', 'parking:right': 'no' }),
      ruleContext(),
    )
    expect(issues).toHaveLength(1)
  })

  it('does not flag both with another suffix', () => {
    expect(
      bothConflictsSide.validate(
        entity('w-3', { 'parking:both': 'lane', 'parking:left:fee': 'no' }),
        ruleContext(),
      ),
    ).toHaveLength(0)
  })

  it('splits both: own side values win, the others take the both value', () => {
    expect(splitBoth({ 'parking:both:fee': 'yes', 'parking:left:fee': 'no' }, ':fee')).toEqual({
      'parking:left:fee': 'no',
      'parking:right:fee': 'yes',
    })
  })

  it('applies the split fix to the entity', () => {
    const made = entity('w-3', { 'parking:both:fee': 'yes', 'parking:left:fee': 'no' })
    const graph = graphOf(made)
    const [issue] = bothConflictsSide.validate(made, ruleContext(graph))
    const fix = issue?.fixes[0]
    expect(fix).toBeDefined()
    if (!fix) return
    expect(tagsAfterFix(fix, graph, 'w-3')).toEqual({
      'parking:left:fee': 'no',
      'parking:right:fee': 'yes',
    })
  })
})
