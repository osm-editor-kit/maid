import { describe, expect, it } from 'bun:test'
import { AGE_NOW, ageStepOf, legendEntries, photoColorExpression } from './colors.ts'

const YEAR = 365 * 24 * 60 * 60 * 1000

describe('photo colours', () => {
  it('sorts a capture time into its age step', () => {
    expect(ageStepOf(AGE_NOW - 0.5 * YEAR)?.id).toBe('current')
    expect(ageStepOf(AGE_NOW - 3 * YEAR)?.id).toBe('mid')
    expect(ageStepOf(AGE_NOW - 6 * YEAR)?.id).toBe('old')
    expect(ageStepOf(null)).toBeNull()
  })

  it('counts the photos per age step, newest first; "no date" only when there is one', () => {
    const photos = [
      { capturedAt: AGE_NOW - 0.5 * YEAR, isPano: true },
      { capturedAt: AGE_NOW - 1 * YEAR, isPano: false },
      { capturedAt: AGE_NOW - 6 * YEAR, isPano: false },
    ]
    expect(legendEntries('age', photos).map((entry) => [entry.id, entry.count])).toEqual([
      ['current', 2],
      ['mid', 0],
      ['old', 1],
    ])
    expect(legendEntries('age', [{ capturedAt: null, isPano: null }]).at(-1)).toMatchObject({
      id: 'unknown',
      count: 1,
    })
    expect(legendEntries('type', photos).map((entry) => [entry.id, entry.count])).toEqual([
      ['pano', 1],
      ['flat', 2],
    ])
  })

  it('colours by age with a step expression, by type with the package', () => {
    expect(JSON.stringify(photoColorExpression('age'))).toContain('capturedAt')
    expect(JSON.stringify(photoColorExpression('type'))).toContain('isPano')
  })
})
