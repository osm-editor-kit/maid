import { describe, expect, it } from 'bun:test'
import type { Listing } from './helpers.ts'
import {
  backgroundGroup,
  dateText,
  groupRows,
  layerAge,
  layerLinks,
  overlayRows,
  repeatsName,
} from './panel-rows.ts'

function layer(overrides: Partial<Listing> & { id: string }): Listing {
  return { name: overrides.id, best: false, overlay: false, ...overrides }
}

describe('backgroundGroup', () => {
  it('files an aerial photo with a coverage area as local, a worldwide one as global', () => {
    expect(backgroundGroup('photo', false)).toBe('local-photo')
    expect(backgroundGroup('photo', undefined)).toBe('local-photo')
    expect(backgroundGroup('photo', true)).toBe('global-photo')
  })

  it('files maps, historic layers and elevation together', () => {
    expect(backgroundGroup('map', true)).toBe('maps')
    expect(backgroundGroup('osmbasedmap', true)).toBe('maps')
    expect(backgroundGroup('historicmap', false)).toBe('historic')
    expect(backgroundGroup('historicphoto', true)).toBe('historic')
    expect(backgroundGroup('elevation', false)).toBe('elevation')
  })

  it('files quality assurance, other and unknown categories in Other', () => {
    expect(backgroundGroup('qa', false)).toBe('other')
    expect(backgroundGroup('other', false)).toBe('other')
    expect(backgroundGroup('something-new', false)).toBe('other')
    expect(backgroundGroup(undefined, false)).toBe('other')
  })
})

describe('groupRows', () => {
  it('lists the groups in order, leaves out empty ones and keeps the order inside a group', () => {
    const rows = [
      { id: 'a', group: 'other' as const },
      { id: 'b', group: 'maps' as const },
      { id: 'c', group: 'other' as const },
      { id: 'd', group: 'local-photo' as const },
    ]
    const groups = groupRows(rows)
    expect(groups.map((group) => group.label)).toEqual(['Local aerial imagery', 'Maps', 'Other'])
    expect(groups[2]?.rows.map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('returns no groups for no rows', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('repeatsName', () => {
  it('repeats the name in any case and with spaces trimmed', () => {
    expect(repeatsName('  bing AERIAL ', 'Bing Aerial')).toBe(true)
    expect(repeatsName('Bing  Aerial', 'Bing Aerial')).toBe(true)
  })

  it('keeps a text that only contains the name or a part of it: it says more', () => {
    expect(repeatsName('Aerial', 'Bing Aerial')).toBe(false)
    expect(repeatsName('Bing Aerial imagery © Microsoft', 'Bing Aerial')).toBe(false)
  })

  it('does not repeat a text that says something else', () => {
    expect(repeatsName('Imagery from 2021 by the city', 'Berlin DOP20')).toBe(false)
  })

  it('treats an empty text as a repeat, nothing to show', () => {
    expect(repeatsName('   ', 'Bing Aerial')).toBe(true)
    expect(repeatsName(undefined, 'Bing Aerial')).toBe(true)
  })
})

describe('layerLinks', () => {
  it('gives the attribution and the licence when they are web addresses', () => {
    expect(
      layerLinks({
        attributionUrl: 'https://example.org/terms',
        licenseUrl: 'https://example.org/licence',
      }),
    ).toEqual([
      { label: 'Attribution', url: 'https://example.org/terms' },
      { label: 'License', url: 'https://example.org/licence' },
    ])
  })

  it('lists a licence that is the attribution page once', () => {
    expect(
      layerLinks({
        attributionUrl: 'https://example.org/terms',
        licenseUrl: 'https://example.org/terms',
      }),
    ).toEqual([{ label: 'Attribution', url: 'https://example.org/terms' }])
  })

  it('gives no link without a URL, and none for a scheme that is not a web address', () => {
    expect(layerLinks({})).toEqual([])
    expect(layerLinks({ attributionUrl: '  ', licenseUrl: undefined })).toEqual([])
    expect(layerLinks({ attributionUrl: 'javascript:alert(1)' })).toEqual([])
    expect(layerLinks({ licenseUrl: 'not a url' })).toEqual([])
  })
})

describe('dates', () => {
  it('reads both dates, one of them, or none', () => {
    expect(dateText('2010', '2015')).toBe('2010 – 2015')
    expect(dateText('2010', undefined)).toBe('from 2010')
    expect(dateText(undefined, '2015')).toBe('until 2015')
    expect(dateText(' ', '')).toBeUndefined()
    expect(dateText('2012', '2012')).toBe('2012')
  })

  it('falls back to the series label when the index gives no dates', () => {
    expect(layerAge({ startDate: '2010' }, '2025 Sommer')).toBe('from 2010')
    expect(layerAge({}, '2025 Sommer')).toBe('2025 Sommer')
    expect(layerAge({}, undefined)).toBeUndefined()
  })
})

describe('overlayRows', () => {
  it('lists the overlays in view and the ones on, once each, sorted best first then by name', () => {
    const inView = [
      layer({ id: 'o1', name: 'Zeta', overlay: true }),
      layer({ id: 'o2', name: 'Alpha', overlay: true, best: true }),
      layer({ id: 'b1', name: 'A background' }),
    ]
    const on = [
      layer({ id: 'o3', name: 'Out of view', overlay: true }),
      layer({ id: 'o1', name: 'Zeta', overlay: true }),
    ]
    expect(overlayRows(inView, on).map((item) => item.id)).toEqual(['o2', 'o3', 'o1'])
  })

  it('leaves out an on layer that is not an overlay', () => {
    expect(overlayRows([], [layer({ id: 'b1' })])).toEqual([])
  })
})
