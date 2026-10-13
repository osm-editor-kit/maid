import { describe, expect, it } from 'bun:test'
import { restrictionOnParkingSide } from './restriction-on-parking-side.ts'
import { entity, ruleContext } from './test-helpers.ts'

const run = (tags: Record<string, string>) =>
  restrictionOnParkingSide.validate(entity('w-1', tags), ruleContext())

describe('parking_restriction_on_parking_side', () => {
  it('flags parking and an unconditional no_parking on the same side', () => {
    const issues = run({
      highway: 'residential',
      name: 'Testweg',
      'parking:left': 'lane',
      'parking:left:restriction': 'no_parking',
    })
    expect(issues).toHaveLength(1)
    expect(issues[0]?.rule).toBe('parking_restriction_on_parking_side')
    expect(issues[0]?.severity).toBe('warning')
    expect(issues[0]?.message).toContain('Testweg (highway=residential)')
    expect(issues[0]?.message).toContain('parking:left=lane, parking:left:restriction=no_parking')
    expect(issues[0]?.fixes).toHaveLength(0)
  })

  it('does not flag a time-limited ban, which is in the conditional key', () => {
    expect(
      run({
        highway: 'residential',
        'parking:right': 'lane',
        'parking:right:restriction:conditional': 'no_stopping @ (Mo-Fr 07:00-18:00)',
      }),
    ).toHaveLength(0)
  })

  it('does not flag a side that exempts a vehicle class: a taxi stand is a lane with no stopping (S15)', () => {
    expect(
      run({
        highway: 'residential',
        'parking:right': 'lane',
        'parking:right:restriction': 'no_stopping',
        'parking:right:restriction:taxi': 'none',
      }),
    ).toHaveLength(0)
    // a reason is not an exemption
    expect(
      run({
        highway: 'residential',
        'parking:right': 'lane',
        'parking:right:restriction': 'no_stopping',
        'parking:right:restriction:reason': 'bus_lane',
      }),
    ).toHaveLength(1)
  })

  it('reads a both value on a side, and does not flag the other side', () => {
    const issues = run({
      highway: 'residential',
      'parking:both': 'street_side',
      'parking:right:restriction': 'no_stopping',
    })
    expect(issues.map((issue) => issue.id)).toEqual([
      'parking_restriction_on_parking_side:w-1:right',
    ])
    expect(
      run({
        highway: 'residential',
        'parking:left': 'lane',
        'parking:right:restriction': 'no_stopping',
      }),
    ).toHaveLength(0)
  })
})
