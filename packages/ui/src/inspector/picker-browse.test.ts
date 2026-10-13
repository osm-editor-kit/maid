import { describe, expect, it } from 'bun:test'
import type { Preset, PresetCategory, PresetRow } from '@osm-editor-kit/maid-presets'
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

/** One label per row: the section (or category), the id, and the marks of a member and an open category */
function labels(rows: ListRow[]) {
  return rows.map((row) =>
    row.kind === 'category'
      ? `category:${row.category.id}${row.expanded ? '+' : ''}`
      : `${row.member ? 'member' : row.section}:${row.preset.id}`,
  )
}

const NONE = new Set<string>()

describe('listRows with a search', () => {
  it('lists the found presets in their order, and nothing else', () => {
    const rows = listRows({
      searching: true,
      found: [preset('a'), preset('b')],
      defaults: [preset('d'), category('cat', [preset('m1'), preset('m2')])],
      recent: [preset('r')],
      favourites: [preset('b')],
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
      expanded: new Set(['cat']),
    })
    expect(rows.some((row) => row.kind === 'category')).toBe(false)
  })
})

describe('listRows with an empty search', () => {
  it('lists the favourites, then the recent presets, then the defaults', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('d1'), preset('d2')],
      recent: [preset('r1')],
      favourites: [preset('f1')],
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourite:f1', 'recent:r1', 'default:d1', 'default:d2'])
  })

  it('lists a recent preset that is a favourite only as a favourite', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [],
      recent: [preset('f1'), preset('r1')],
      favourites: [preset('f1')],
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourite:f1', 'recent:r1'])
  })

  it('lists a default that is a favourite or a recent preset only once, where it is first', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('f1'), preset('r1'), preset('d1')],
      recent: [preset('r1')],
      favourites: [preset('f1')],
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourite:f1', 'recent:r1', 'default:d1'])
  })

  it('lists a recent preset once even when it is given twice', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [],
      recent: [preset('r1'), preset('r1')],
      favourites: [],
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['recent:r1'])
  })

  it('without a browse list, lists the presets that the empty search gives, favourites first', () => {
    // the picker passes the empty search's presets as the defaults, and no recents
    const rows = listRows({
      searching: false,
      found: [],
      defaults: [preset('a'), preset('b'), preset('c')],
      recent: [],
      favourites: [preset('c')],
      expanded: NONE,
    })
    expect(labels(rows)).toEqual(['favourite:c', 'default:a', 'default:b'])
  })

  it('lists nothing for an empty search with nothing to list', () => {
    expect(
      listRows({
        searching: false,
        found: [],
        defaults: [],
        recent: [],
        favourites: [],
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
      expanded: new Set(['cat']),
    })
    const keys = rows.map((row) => row.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(labels(rows)).toEqual(['category:cat+', 'member:m1', 'member:m2', 'default:m1'])
  })

  it('lists a member of an open category that is a favourite, under the category too', () => {
    const rows = listRows({
      searching: false,
      found: [],
      defaults,
      recent: [],
      favourites: [preset('m1')],
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual([
      'favourite:m1',
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
      expanded: new Set(['cat']),
    })
    expect(labels(rows)).toEqual(['default:d1'])
  })
})
