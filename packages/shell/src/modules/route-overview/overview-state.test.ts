import { describe, expect, it } from 'bun:test'
import { EditHistory, ModelContext } from '@osm-editor-kit/maid-model'
import { dataVersion } from './data-version.ts'
import { markSelectedFromOverview, takeSelectedFromOverview } from './overview-selection.ts'

describe('dataVersion', () => {
  it('moves on arriving data and edits, and on nothing else', () => {
    const history = new EditHistory(new ModelContext())
    const start = dataVersion(history)
    expect(dataVersion(history)).toBe(start)
    history.emit('merge', new Set())
    expect(dataVersion(history)).toBe(start + 1)
  })
})

describe('the selection made from the overview', () => {
  it('is taken once, and only for the id that was marked', () => {
    markSelectedFromOverview('n1')
    expect(takeSelectedFromOverview('n2')).toBe(false)
    expect(takeSelectedFromOverview('n1')).toBe(false)
    markSelectedFromOverview('n1')
    expect(takeSelectedFromOverview('n1')).toBe(true)
    expect(takeSelectedFromOverview('n1')).toBe(false)
  })
})
