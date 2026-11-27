import { describe, expect, it } from 'bun:test'
import type { Listing } from './helpers.ts'
import {
  backgroundGroup,
  dateText,
  groupRows,
  overlayGroups,
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

  it('files maps in Maps', () => {
    expect(backgroundGroup('map', true)).toBe('maps')
    expect(backgroundGroup('osmbasedmap', false)).toBe('maps')
  })

  it('files historic layers, elevation and the rest with the photos, by their coverage', () => {
    expect(backgroundGroup('historicmap', false)).toBe('local-photo')
    expect(backgroundGroup('historicphoto', true)).toBe('global-photo')
    expect(backgroundGroup('elevation', false)).toBe('local-photo')
    expect(backgroundGroup('qa', true)).toBe('global-photo')
    expect(backgroundGroup('something-new', false)).toBe('local-photo')
    expect(backgroundGroup(undefined, false)).toBe('local-photo')
  })
})

describe('groupRows', () => {
  it('lists the groups in order, maps last, leaves out empty ones and keeps the order inside a group', () => {
    const rows = [
      { id: 'a', group: 'maps' as const },
      { id: 'b', group: 'global-photo' as const },
      { id: 'c', group: 'maps' as const },
    ]
    const groups = groupRows(rows)
    expect(groups.map((group) => group.label)).toEqual(['Global aerial imagery', 'Maps'])
    expect(groups[1]?.rows.map((row) => row.id)).toEqual(['a', 'c'])
  })

  it('keeps an empty group when asked to', () => {
    expect(groupRows([], ['local-photo']).map((group) => group.id)).toEqual(['local-photo'])
  })

  it('returns no groups for no rows', () => {
    expect(groupRows([])).toEqual([])
  })
})

describe('overlayGroups', () => {
  const named = (...names: string[]) => names.map((name) => ({ name }))
  const shape = (entries: ReturnType<typeof overlayGroups<{ name: string }>>) =>
    entries.map((entry) =>
      entry.kind === 'layer' ? entry.item.name : [entry.label, entry.items.map((i) => i.short)],
    )

  it('groups by the part before a separator, then two words, then one word', () => {
    const entries = overlayGroups(
      named(
        'BANO',
        'IBGE BC250 - Vila',
        'IBGE BC250 - Rios Drenagem',
        'Kartverket Buildings overlay',
        'Kartverket Road Network',
        'OSM Inspector: Highways',
        'OSM Inspector: Places',
        'TIGER Roads 2022',
        'TIGER Roads 2023',
      ),
    )
    expect(shape(entries)).toEqual([
      'BANO',
      ['IBGE BC250', ['Vila', 'Rios Drenagem']],
      ['Kartverket', ['Buildings overlay', 'Road Network']],
      ['OSM Inspector', ['Highways', 'Places']],
      ['TIGER Roads', ['2022', '2023']],
    ])
  })

  it('keeps an overlay alone as a row, and the whole name when it is the prefix', () => {
    const entries = overlayGroups(named('OpenRailwayMap', 'OpenRailwayMap Maxspeeds', 'Route 500'))
    expect(shape(entries)).toEqual([
      ['OpenRailwayMap', ['OpenRailwayMap', 'Maxspeeds']],
      'Route 500',
    ])
  })

  it('makes no group of an article, and cuts names with odd spaces at the right place', () => {
    const entries = overlayGroups(
      named(
        'The Atlas',
        'The Survey',
        'TIGER  Roads 2022',
        ' TIGER Roads 2023',
        'NVE Flood',
        'NVE Snow',
      ),
    )
    expect(shape(entries)).toEqual([
      'The Atlas',
      'The Survey',
      ['TIGER Roads', ['2022', '2023']],
      ['NVE', ['Flood', 'Snow']],
    ])
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
