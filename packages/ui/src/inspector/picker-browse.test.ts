import { describe, expect, it } from 'bun:test'
import type { Preset, PresetCategory, PresetRow } from '@osm-editor-kit/maid-presets'
import type { FavouriteEntry } from '../favourites.ts'
import { listRows, type ListRow } from './picker-browse.ts'

function preset(id: string): Preset {
  return {
    id,
    name: id,
    geometry: ['point'],
    tags: { [id]: 'yes' },
    addTags: {},
    removeTags: {},
    matchScore: 1,
    searchable: true,
    terms: [],
    aliases: [],
  }
}

function category(id: string, members: Preset[]): PresetCategory {
  return { ...preset(id), tags: {}, members }
}

/** A favourite of a preset for a geometry, numbered 4 (the number is not what these tests look at) */
function fav(id: string, geometry: FavouriteEntry['geometry'] = 'point'): FavouriteEntry {
  return { preset: preset(id), number: '4', geometry }
}

/**
 * One label per row: the section (or category, or the Favourites row), the id, and the marks of a member and an
 * open category or Favourites row
 */
function labels(rows: ListRow[]) {
  return rows.map((row) => {
    if (row.kind === 'category') return `category:${row.category.id}${row.expanded ? '+' : ''}`
    if (row.kind === 'favourites') return `favourites${row.expanded ? '+' : ''}`
    if (row.section === 'favourite') return `favourite:${row.preset.id}`
    return `${row.member ? 'member' : row.section}:${row.preset.id}`
  })
}

const NONE = new Set<string>()

describe('listRows with a search', () => {
  it('lists the found presets in their order, and nothing else', () => {
    const rows = listRows({
      searching: true,
      found: [preset('a'), preset('b')],
      defaults: [preset('d'), category('cat', [preset('m1'), preset('m2')])],
      recent: [preset('r')],
      favourites: [fav('b')],
      favouritesOpen: true,
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual(['search:a', 'search:b'])
  })

  it('lists no category, even one that is open', () => {
    const rows = listRows({
      searching: true,
      found: [preset('a')],
      defaults: [category('cat', [preset('m1'), preset('m2')])],
      recent: [],
      favourites: [],
      favouritesOpen: false,
      expanded: new Set(['cat']),
    })
    expect(rows.some((row) => row.kind === 'category')).toBe(false)
  })
})

describe('listRows with an empty search: the Favourites row', () => {
  it('lists the Favourites row first, closed, then the recent presets, then the defaults', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('d1'), preset('d2')],
      recent: [preset('r1')],
      favourites: [fav('f1')],
      favouritesOpen: false,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourites', 'recent:r1', 'default:d1', 'default:d2'])
  })

  it('lists every favourite, of every geometry, under the open Favourites row, indented', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('d1')],
      recent: [],
      favourites: [fav('f1'), fav('f2', 'area'), fav('f1', 'line')],
      favouritesOpen: true,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual([
      'favourites+',
      'favourite:f1',
      'favourite:f2',
      'favourite:f1',
      'default:d1',
    ])
    const members = rows.slice(1, 4)
    expect(members.map((row) => (row.kind === 'preset' ? row.geometry : undefined))).toEqual([
      'point',
      'area',
      'line',
    ])
    expect(members.every((row) => row.kind === 'preset' && row.member)).toBe(true)
  })

  it('gives a favourite of two geometries two different keys', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [],
      recent: [],
      favourites: [fav('f1'), fav('f1', 'line')],
      favouritesOpen: true,
      expanded: NONE,
    })
    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no Favourites row without favourites', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('d1')],
      recent: [],
      favourites: [],
      favouritesOpen: true,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['default:d1'])
  })

  it('lists a favourite where it belongs too: among the recent presets and the defaults', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('f1'), preset('r1'), preset('d1')],
      recent: [preset('r1'), preset('f1')],
      favourites: [fav('f1')],
      favouritesOpen: false,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourites', 'recent:r1', 'recent:f1', 'default:d1'])
  })

  it('lists a recent preset once even when it is given twice', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [],
      recent: [preset('r1'), preset('r1')],
      favourites: [],
      favouritesOpen: false,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['recent:r1'])
  })

  it('lists the presets that the empty search gives, when they are the defaults and there are no recents', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('a'), preset('b'), preset('c')],
      recent: [],
      favourites: [fav('c')],
      favouritesOpen: false,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourites', 'default:a', 'default:b', 'default:c'])
  })

  it('lists nothing for an empty search with nothing to list', () => {
    expect(
      listRows({
        searching: false,
        found: [],
        defaults: [],
        recent: [],
        favourites: [],
        favouritesOpen: false,
        expanded: NONE,
      }),
    ).toEqual([])
  })
})

describe('categories in the defaults', () => {
  const members = [preset('m1'), preset('m2')]
  const defaults: PresetRow[] = [preset('d1'), category('cat', members), preset('d2')]

  it('lists a category closed, with no member, where it is in the defaults', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults,
      recent: [],
      favourites: [],
      favouritesOpen: false,
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['default:d1', 'category:cat', 'default:d2'])
  })

  it('lists the members of an open category right after it, indented as members, in their order', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults,
      recent: [],
      favourites: [],
      favouritesOpen: false,
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual([
      'default:d1',
      'category:cat+',
      'member:m1',
      'member:m2',
      'default:d2',
    ])
  })

  it('keeps a member that is also a default: the two rows have different keys', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [category('cat', [preset('m1'), preset('m2')]), preset('m1')],
      recent: [],
      favourites: [],
      favouritesOpen: false,
      expanded: new Set(['cat']),
    })
    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(labels(rows)).toEqual(['category:cat+', 'member:m1', 'member:m2', 'default:m1'])
  })

  it('lists a member of an open category that is a favourite in its place, and under the Favourites row when open', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults,
      recent: [],
      favourites: [fav('m1')],
      favouritesOpen: false,
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual([
      'favourites',
      'default:d1',
      'category:cat+',
      'member:m1',
      'member:m2',
      'default:d2',
    ])
  })

  it('a category that is open is shown open only while it is in the defaults', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('d1')],
      recent: [],
      favourites: [],
      favouritesOpen: false,
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual(['default:d1'])
  })
})
