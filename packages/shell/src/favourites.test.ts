import { beforeAll, describe, expect, it } from 'bun:test'
import {
  createPresets,
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

const { useSettings } = await import('@osm-editor-kit/maid-ui')

/** A point with these tags, its preset matched as the editor matches it */
function node(id: string, tags: Tags) {
  nodes.set(id, { tags, geometry: 'point', preset: presets.match(tags, 'point') })
}

/** Starts the favourite of number 39 (the bench) as the keys do: the point mode is on, pending */
function startBench() {
  useSettings.setState({
    favourites: [{ presetId: 'amenity/bench', geometry: 'point', number: '39' }],
  })
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
