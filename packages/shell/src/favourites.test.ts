import { beforeAll, describe, expect, it } from 'bun:test'
import {
  createPresets,
  type Preset,
  type Presets,
  type PresetData,
  type Tags,
} from '@osm-editor-kit/maid-presets'

// A bench whose field `backrest` has the default `yes` (as iD's field defaults), a cafe, and a
// feature the picker never changes: the editor and the engine are replaced by these small stand-ins.
const data: PresetData = {
  presets: {
    'amenity/bench': {
      icon: 'temaki-bench',
      tags: { amenity: 'bench' },
      geometry: ['point', 'vertex'],
      fields: ['backrest'],
    },
    'amenity/cafe': {
      icon: 'maki-cafe',
      tags: { amenity: 'cafe' },
      geometry: ['point'],
      fields: [],
    },
  },
  fields: {
    backrest: { key: 'backrest', type: 'check', default: 'yes' },
  },
  translations: {
    en: {
      presets: {
        presets: {
          'amenity/bench': { name: 'Bench' },
          'amenity/cafe': { name: 'Cafe' },
        },
        fields: { backrest: { label: 'Backrest' } },
      },
    },
  },
}

import * as favourites from './favourites.ts'

const presets: Presets = createPresets(data)

type Stored = { tags: Tags; geometry: 'point'; preset: ReturnType<Presets['match']> }
const nodes = new Map<string, Stored>()
const writes: { id: string; tags: Tags; message: string }[] = []
const editing = { mode: 'browse' }

// the editor's engine as the favourites code uses it: the entities, the mode and the writes of tags
const engine = {
  selection: [] as string[],
  get mode() {
    return editing.mode
  },
  subscribe: () => () => {},
  entity: (id: string) => nodes.get(id),
  // the places of these tests are not checked: a point has no location set that holds only somewhere
  centreOf: () => undefined,
  setMode: (next: string) => {
    editing.mode = next
    return true
  },
  setTags: (id: string, tags: Tags, message: string) => {
    writes.push({ id, tags, message })
    const node = nodes.get(id)
    if (node) node.tags = tags
  },
}

const parts = { editor: { presets }, engine } as unknown as Parameters<
  typeof favourites.startFavourite
>[0]

const { getSettings, settingsActions } = await import('@osm-editor-kit/maid-ui')

/** A point with these tags, its preset matched as the editor matches it */
function node(id: string, tags: Tags) {
  nodes.set(id, { tags, geometry: 'point', preset: presets.match(tags, 'point') })
}

/** Starts the favourite of number 39 (the bench) as the keys do: the point mode is on, pending */
function startBench() {
  // the bench is the only favourite: added once, then numbered 39
  if (!getSettings().favourites.some((item) => item.presetId === 'amenity/bench')) {
    settingsActions.toggleFavourite('amenity/bench', 'point')
  }
  settingsActions.setFavouriteNumber('amenity/bench', 'point', '39')
  favourites.startFavourite(parts, '39')
}

describe('a favourite that is given to a clicked node', () => {
  beforeAll(() => {
    writes.length = 0
    nodes.clear()
    editing.mode = 'browse'
  })

  it('keeps the value the node has: a field default does not overwrite it', () => {
    node('n1', { amenity: 'bench', backrest: 'no' })
    startBench()
    favourites.giveFavouriteTagsToNode(parts, 'n1')
    expect(writes.at(-1)).toEqual({
      id: 'n1',
      tags: { amenity: 'bench', backrest: 'no' },
      message: 'Changed the feature type',
    })
  })

  it('adds a missing field default', () => {
    node('n2', { amenity: 'picnic_table' })
    startBench()
    favourites.giveFavouriteTagsToNode(parts, 'n2')
    expect(writes.at(-1)?.tags).toEqual({ amenity: 'bench', backrest: 'yes' })
  })

  it('keeps the tags that are not the preset of the node', () => {
    node('n3', { name: 'Park bench', amenity: 'bench' })
    startBench()
    favourites.giveFavouriteTagsToNode(parts, 'n3')
    expect(writes.at(-1)?.tags).toEqual({ name: 'Park bench', amenity: 'bench', backrest: 'yes' })
  })

  it('changes the type as picking it would: the old type goes, the name stays', () => {
    node('n4', { name: 'Kiosk', amenity: 'cafe' })
    startBench()
    favourites.giveFavouriteTagsToNode(parts, 'n4')
    expect(writes.at(-1)?.tags).toEqual({ name: 'Kiosk', amenity: 'bench', backrest: 'yes' })
  })

  it('does nothing when no favourite is pending', () => {
    node('n5', { amenity: 'cafe' })
    const before = writes.length
    favourites.giveFavouriteTagsToNode(parts, 'n5')
    expect(writes.length).toBe(before)
  })
})

describe('the type of several features', () => {
  // each feature's tags and old preset, as the engine keeps them; the writes go to one fake engine call
  const features = new Map<string, { tags: Tags; geometry: 'point'; preset: Preset | undefined }>()
  const calls: { changes: { id: string; tags: Tags }[]; annotation: string }[] = []
  const many = {
    editor: { presets },
    engine: {
      entity: (id: string) => features.get(id),
      centreOf: () => undefined,
      setTagsEach: (changes: { id: string; tags: Tags }[], annotation: string) => {
        calls.push({ changes, annotation })
        return { ok: true as const, changed: changes.length }
      },
    },
  } as unknown as Parameters<typeof favourites.changeTypeMany>[0]

  const bench = presets.preset('amenity/bench')
  if (!bench) throw new Error('the test data has the bench preset')

  it('gives each feature the new tags from its own tags and old preset, in one call', () => {
    features.clear()
    calls.length = 0
    features.set('a', {
      tags: { amenity: 'cafe', name: 'Kiosk' },
      geometry: 'point',
      preset: presets.match({ amenity: 'cafe' }, 'point'),
    })
    features.set('b', {
      tags: { amenity: 'bench', name: 'Park' },
      geometry: 'point',
      preset: presets.match({ amenity: 'bench' }, 'point'),
    })
    const result = favourites.changeTypeMany(many, ['a', 'b'], bench)

    expect(result).toEqual({ ok: true, changed: 2 })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.annotation).toBe('Changed tags')
    expect(calls[0]?.changes).toEqual([
      { id: 'a', tags: { name: 'Kiosk', amenity: 'bench', backrest: 'yes' } },
      { id: 'b', tags: { name: 'Park', amenity: 'bench', backrest: 'yes' } },
    ])
  })

  it('refuses a feature that is not in the data, and writes nothing', () => {
    calls.length = 0
    const result = favourites.changeTypeMany(many, ['a', 'gone'], bench)
    expect(result).toEqual({ ok: false, reason: 'missing' })
    expect(calls).toHaveLength(0)
  })

  it('lists only the presets that take every geometry of the features', () => {
    // the bench takes point and vertex, the cafe only point
    const onlyPoints = favourites.presetsForAll(presets, '', ['point'])
    expect(onlyPoints.map((preset) => preset.id)).toEqual(
      expect.arrayContaining(['amenity/bench', 'amenity/cafe']),
    )
    const pointAndVertex = favourites.presetsForAll(presets, '', ['point', 'vertex'])
    expect(pointAndVertex.map((preset) => preset.id)).toContain('amenity/bench')
    expect(pointAndVertex.map((preset) => preset.id)).not.toContain('amenity/cafe')
  })

  it('lists nothing when no geometry is given', () => {
    expect(favourites.presetsForAll(presets, 'bench', [])).toEqual([])
  })
})

describe('a preset started as a geometry (the favourites panel)', () => {
  it('switches on the add mode of that geometry, and nothing for one the editor does not add', () => {
    const bench = presets.preset('amenity/bench') as Preset
    editing.mode = 'browse'
    favourites.startAdding(parts, bench, 'point')
    expect(editing.mode).toBe('add-point')
    editing.mode = 'browse'
    favourites.startAdding(parts, bench, 'vertex' as Preset['geometry'][number])
    expect(editing.mode).toBe('browse')
  })
})

describe('a relation is never a favourite', () => {
  it('toggling a relation type adds no favourite', () => {
    const bench = presets.preset('amenity/bench') as Preset
    const before = getSettings().favourites.length
    favourites.toggleFavourite(bench, 'relation')
    expect(getSettings().favourites.length).toBe(before)
    expect(getSettings().favourites.some((item) => item.geometry === 'relation')).toBe(false)
  })

  it('leaves stored relation favourites out of the entries the picker lists', () => {
    const stored = [
      { presetId: 'amenity/bench', number: '4', geometry: 'point' as const },
      { presetId: 'amenity/cafe', number: '5', geometry: 'relation' as const },
      { presetId: 'amenity/missing', number: '6', geometry: 'point' as const },
    ]
    const entries = favourites.favouriteEntries(stored, presets)
    expect(entries.map((entry) => [entry.preset.id, entry.geometry, entry.number])).toEqual([
      ['amenity/bench', 'point', '4'],
    ])
    expect(favourites.favouriteEntries(stored, undefined)).toEqual([])
  })
})
