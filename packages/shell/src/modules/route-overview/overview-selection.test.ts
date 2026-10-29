import { describe, expect, it } from 'bun:test'
import { markSelectedFromOverview, takeSelectedFromOverview } from './overview-selection.ts'

describe('the mark of a selection made in the route overview', () => {
  it('is taken once for its id', () => {
    markSelectedFromOverview('w1')
    expect(takeSelectedFromOverview('w1')).toBe(true)
    expect(takeSelectedFromOverview('w1')).toBe(false)
  })

  it('is cleared by a selection of nothing, so a later click on the map scrolls again', () => {
    markSelectedFromOverview('w1')
    expect(takeSelectedFromOverview(null)).toBe(false)
    expect(takeSelectedFromOverview('w1')).toBe(false)
  })

  it('is cleared by a selection of another id', () => {
    markSelectedFromOverview('w1')
    expect(takeSelectedFromOverview('w2')).toBe(false)
    expect(takeSelectedFromOverview('w1')).toBe(false)
  })
})
