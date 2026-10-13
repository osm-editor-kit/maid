import { describe, expect, it } from 'bun:test'
import { pauseText } from './FetchPauses.tsx'

// 13 Oct 2026, 14:32 in Berlin (UTC+2 in October), and ten seconds before it
const UNTIL = Date.parse('2026-10-13T12:32:00Z')
const NOW = UNTIL - 10_000
const BERLIN = { now: NOW, timeZone: 'Europe/Berlin' }

describe('pauseText', () => {
  it('names the OSM API, and the local time when loading goes on', () => {
    expect(pauseText({ service: 'osm', until: UNTIL }, BERLIN)).toBe(
      'The OSM API is limiting requests. Loading continues at 13 Oct, 14:32.',
    )
  })

  it('uses the plural for the OSM Wiki and Wikimedia', () => {
    expect(pauseText({ service: 'wikimedia', until: UNTIL }, BERLIN)).toBe(
      'The OSM Wiki and Wikimedia are limiting requests. Loading continues at 13 Oct, 14:32.',
    )
  })

  it('names Mapillary, Panoramax, a data layer and the local server', () => {
    expect(pauseText({ service: 'mapillary', until: UNTIL }, BERLIN)).toMatch(
      /^Mapillary is limiting requests\./,
    )
    expect(pauseText({ service: 'panoramax', until: UNTIL }, BERLIN)).toMatch(
      /^Panoramax is limiting requests\./,
    )
    expect(pauseText({ service: 'data', until: UNTIL }, BERLIN)).toMatch(
      /^A data layer's server is limiting requests\./,
    )
    expect(pauseText({ service: 'local', until: UNTIL }, BERLIN)).toMatch(
      /^The local server is limiting requests\./,
    )
  })

  it('shows the time in the zone it is given', () => {
    expect(pauseText({ service: 'osm', until: UNTIL }, { now: NOW, timeZone: 'UTC' })).toBe(
      'The OSM API is limiting requests. Loading continues at 13 Oct, 12:32.',
    )
  })

  it('gives the day when the pause ends on another day than now', () => {
    const tomorrowNow = UNTIL - 2 * 24 * 60 * 60 * 1000
    expect(
      pauseText({ service: 'osm', until: UNTIL }, { now: tomorrowNow, timeZone: 'Europe/Berlin' }),
    ).toBe('The OSM API is limiting requests. Loading continues at 13 Oct, 14:32.')
    const yearAgo = Date.parse('2025-10-13T12:00:00Z')
    expect(
      pauseText({ service: 'osm', until: UNTIL }, { now: yearAgo, timeZone: 'Europe/Berlin' }),
    ).toBe('The OSM API is limiting requests. Loading continues at 13 Oct 2026, 14:32.')
  })

  it('is the same text for the same pause and clock', () => {
    expect(pauseText({ service: 'osm', until: UNTIL }, BERLIN)).toBe(
      pauseText({ service: 'osm', until: UNTIL }, BERLIN),
    )
  })
})
