import { describe, expect, it } from 'bun:test'
import type { ListEntry } from '@osm-editor-kit/maid-osm-prefs'
import { cleanupOffers } from './cleanup.ts'

const DAY = 86_400
const NOW = 1_800_000_000
const entry = (listKey: string, daysAgo: number): ListEntry => ({
  listKey,
  meta: { v: 1, s: 'a', n: 1, c: 10, r: 1, u: NOW - daysAgo * DAY, h: 'abcdefgh' },
})

describe('cleanupOffers', () => {
  it('offers lists older than 30 days, oldest first', () => {
    const offers = cleanupOffers(
      [entry('aaaaaaa1', 40), entry('aaaaaaa2', 10), entry('aaaaaaa3', 90)],
      undefined,
      NOW,
    )
    expect(offers.map((offer) => offer.listKey)).toEqual(['aaaaaaa3', 'aaaaaaa1'])
  })
  it('does not offer a list of exactly 30 days', () => {
    expect(cleanupOffers([entry('aaaaaaa1', 30)], undefined, NOW)).toEqual([])
  })
  it('never offers the loaded list', () => {
    expect(
      cleanupOffers([entry('aaaaaaa1', 90), entry('aaaaaaa2', 90)], 'aaaaaaa1', NOW).map(
        (offer) => offer.listKey,
      ),
    ).toEqual(['aaaaaaa2'])
  })
  it('offers nothing for no lists', () => {
    expect(cleanupOffers([], 'x', NOW)).toEqual([])
  })
})
