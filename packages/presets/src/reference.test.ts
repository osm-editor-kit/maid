import { describe, expect, it } from 'bun:test'
import { defaultPresets as presets } from './default.ts'
import { createPresets } from './presets.ts'
import type { Preset, Presets } from './types.ts'

type Raw = Record<string, unknown>

function presetOf(id: string): Preset {
  const preset = presets.preset(id)
  if (!preset) throw new Error(`no preset ${id}`)
  return preset
}

function custom(presetRaw: Record<string, Raw>, fieldRaw: Record<string, Raw> = {}): Presets {
  return createPresets({ presets: presetRaw, fields: fieldRaw, translations: {} })
}

// Expected values were read from the id-tagging-schema 6.19.2 data (dist/*.min.json), not from this code.

describe('preset reference from the schema', () => {
  it('takes the schema key and value for waterway/stream_intermittent', () => {
    expect(presetOf('waterway/stream_intermittent').reference).toEqual({
      key: 'waterway',
      value: 'stream',
    })
  })

  it('takes the schema reference over the first tag for type/site/climbing/crag', () => {
    // the first tag is type=site, but the schema points at climbing=crag
    expect(presetOf('type/site/climbing/crag').reference).toEqual({
      key: 'climbing',
      value: 'crag',
    })
  })

  it('takes a schema key without value as it is, when the tags have no value for it', () => {
    // address has tags addr:*=*, and the schema's reference is the key addr: no tag addr exists
    expect(presetOf('address').reference).toEqual({ key: 'addr' })
  })
})

describe('preset reference derived from the tags, as iD does', () => {
  it('uses the first tag and its value for amenity/cafe', () => {
    expect(presetOf('amenity/cafe').reference).toEqual({ key: 'amenity', value: 'cafe' })
  })

  it('uses highway=residential for highway/residential', () => {
    expect(presetOf('highway/residential').reference).toEqual({
      key: 'highway',
      value: 'residential',
    })
  })

  it('uses the first key other than name', () => {
    const data = custom({
      named: { name: 'Park', tags: { name: '*', leisure: 'park' }, geometry: ['area'] },
    })
    expect(data.preset('named')?.reference).toEqual({ key: 'leisure', value: 'park' })
  })

  it('leaves the value out when the tag value is *', () => {
    const data = custom({
      addr: { tags: { 'addr:*': '*' }, geometry: ['point'] },
    })
    expect(data.preset('addr')?.reference).toEqual({ key: 'addr:*' })
  })

  it('uses the schema value over the tag value', () => {
    const data = custom({
      shop: {
        tags: { shop: 'bakery' },
        geometry: ['point'],
        reference: { key: 'shop', value: 'other' },
      },
    })
    expect(data.preset('shop')?.reference).toEqual({ key: 'shop', value: 'other' })
  })

  it('fills in the value from the tags when the schema gives only a key', () => {
    const data = custom({
      shop: { tags: { shop: 'bakery' }, geometry: ['point'], reference: { key: 'shop' } },
    })
    expect(data.preset('shop')?.reference).toEqual({ key: 'shop', value: 'bakery' })
  })

  it('has no reference for the generic point preset, which has no tags', () => {
    expect(presets.preset('point')?.reference).toBeUndefined()
  })
})

describe('field reference', () => {
  it('takes the schema reference of tee: golf=tee', () => {
    expect(presets.field('tee')?.reference).toEqual({ key: 'golf', value: 'tee' })
  })

  it('takes the schema reference of vehicles, which has no key of its own', () => {
    expect(presets.field('vehicles')?.reference).toEqual({ key: 'public_transport' })
  })

  it('takes the schema reference of sidewalk over its key sidewalk:both', () => {
    expect(presets.field('sidewalk')?.reference).toEqual({ key: 'sidewalk' })
  })

  it('takes the schema reference of address over its key addr', () => {
    expect(presets.field('address')?.reference).toEqual({ key: 'addr:*' })
  })

  it('derives the key of surface, which has no schema reference', () => {
    expect(presets.field('surface')?.reference).toEqual({ key: 'surface' })
  })

  it('has no reference for a field without a key and without a schema reference', () => {
    const data = custom({}, { roads: { type: 'combo', keys: ['a', 'b'] } })
    expect(data.field('roads')?.reference).toBeUndefined()
  })

  it('looks up a multiCombo key ending in : as key:*', () => {
    const data = custom({}, { cuisines: { type: 'multiCombo', key: 'cuisine:' } })
    expect(data.field('cuisines')?.reference).toEqual({ key: 'cuisine:*' })
  })

  it('does not change the lookup of other combo keys that end in :', () => {
    const data = custom({}, { cuisines: { type: 'semiCombo', key: 'cuisine:' } })
    expect(data.field('cuisines')?.reference).toEqual({ key: 'cuisine:' })
  })
})
