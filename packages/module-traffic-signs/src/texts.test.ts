import { describe, expect, it } from 'bun:test'
import { trafficSignTexts } from './texts.ts'

describe('trafficSignTexts', () => {
  it('fills every text of the field, with the values in the functions', () => {
    const texts = trafficSignTexts()
    for (const [key, text] of Object.entries(texts)) {
      expect(typeof text === 'function' || text.length > 0).toBe(true)
      expect(key).toBeTruthy()
    }
    expect(texts.removeSign({ sign: 'Zeichen 274' })).toContain('Zeichen 274')
    expect(texts.moved({ position: 2, total: 3 })).toContain('2')
    expect(texts.moreResults({ count: 7 })).toContain('7')
  })
})
