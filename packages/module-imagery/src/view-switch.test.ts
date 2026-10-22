import { describe, expect, it } from 'bun:test'
import type { Coverage } from './coverage.ts'
import { customValue, NONE } from './url.ts'
import { switchFor, type SwitchInput } from './view-switch.ts'

const KNOWN = new Set(['chosen', 'best', 'fallback', 'other'])
const known = (id: string) => KNOWN.has(id)

const VIEW = [0, 0, 1, 1] as const
/** A square that covers the whole view */
const COVERING: Coverage = {
  type: 'Polygon',
  coordinates: [
    [
      [-1, -1],
      [2, -1],
      [2, 2],
      [-1, 2],
      [-1, -1],
    ],
  ],
}
/** A square far away from the view: it covers nothing of it */
const FAR: Coverage = {
  type: 'Polygon',
  coordinates: [
    [
      [10, 10],
      [11, 10],
      [11, 11],
      [10, 11],
      [10, 10],
    ],
  ],
}
/** A thin strip on the left edge: it covers less than half of the view */
const STRIP: Coverage = {
  type: 'Polygon',
  coordinates: [
    [
      [-1, -1],
      [0.2, -1],
      [0.2, 2],
      [-1, 2],
      [-1, -1],
    ],
  ],
}

const base: SwitchInput = {
  bounds: VIEW,
  chosen: 'chosen',
  chosenCoverage: FAR,
  best: [],
  fallback: null,
  known,
}

describe('switchFor', () => {
  it('keeps the chosen background when it covers more than half of the new view', () => {
    expect(switchFor({ ...base, chosenCoverage: COVERING, best: ['best'] })).toBeNull()
    expect(switchFor({ ...base, chosenCoverage: undefined, best: ['best'] })).toBeNull()
  })

  it('switches to the best layer when the chosen one does not cover the view', () => {
    expect(switchFor({ ...base, best: ['best', 'other'] })).toBe('best')
  })

  it('treats a strip covering less than half of the view as not covering it', () => {
    expect(switchFor({ ...base, chosenCoverage: STRIP, best: ['best'] })).toBe('best')
  })

  it('prefers the best layer over the fallback', () => {
    expect(switchFor({ ...base, best: ['best'], fallback: 'fallback' })).toBe('best')
  })

  it('switches to the fallback when no layer is best for the view', () => {
    expect(switchFor({ ...base, fallback: 'fallback' })).toBe('fallback')
  })

  it('keeps the chosen background when there is no fallback and no best layer', () => {
    expect(switchFor({ ...base, fallback: null })).toBeNull()
  })

  it('does not use a fallback that is not a listed layer', () => {
    expect(switchFor({ ...base, fallback: 'unknown-layer' })).toBeNull()
    const custom = customValue('https://a.example/{z}/{x}/{y}.png')
    expect(switchFor({ ...base, fallback: custom })).toBeNull()
  })

  it('does not switch to the chosen background itself', () => {
    expect(switchFor({ ...base, best: ['chosen'], fallback: 'chosen' })).toBeNull()
    expect(switchFor({ ...base, fallback: 'chosen' })).toBeNull()
  })

  it('never switches none or a custom template', () => {
    expect(switchFor({ ...base, chosen: NONE, best: ['best'], fallback: 'fallback' })).toBeNull()
    const custom = customValue('https://a.example/{z}/{x}/{y}.png')
    expect(switchFor({ ...base, chosen: custom, best: ['best'], fallback: 'fallback' })).toBeNull()
  })

  it('never switches a chosen id the index does not know', () => {
    expect(switchFor({ ...base, chosen: 'unknown-layer', best: ['best'] })).toBeNull()
  })
})
