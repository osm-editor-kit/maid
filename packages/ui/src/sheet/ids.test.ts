import { describe, expect, it } from 'bun:test'
import { newRowIds } from './ids.ts'

describe('newRowIds: the ids of pasted rows', () => {
  it('gives a new id each time, never repeated', () => {
    const next = newRowIds()
    const ids = [next(), next(), next()]
    expect(new Set(ids).size).toBe(3)
  })

  it('never matches the sheet trailing-row id (t<digits>) nor the tags id (tag<digits>)', () => {
    const next = newRowIds()
    for (let i = 0; i < 50; i++) {
      const id = next()
      expect(/^t\d+$/.test(id)).toBe(false)
      expect(/^tag\d+$/.test(id)).toBe(false)
    }
  })

  it('two generators do not share a counter', () => {
    expect(newRowIds()()).toBe(newRowIds()())
  })
})
