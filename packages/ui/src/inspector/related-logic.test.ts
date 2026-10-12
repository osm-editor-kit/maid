import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { isModified, isPresent, removeEdits } from './logic.ts'
import {
  assignRelatedTags,
  relatedButtonKeys,
  relatedCategoryOf,
  relatedLabel,
  relatedSide,
  type RelatedButtons,
} from './related-logic.ts'

const field = (over: Partial<Field>): Field => ({
  id: 'test',
  type: 'text',
  label: 'Test',
  options: [],
  universal: false,
  ...over,
})

describe('relatedCategoryOf', () => {
  it('finds source, note and check date tags in both key orders', () => {
    expect(relatedCategoryOf('source:width', 'width')).toBe('source')
    expect(relatedCategoryOf('width:source', 'width')).toBe('source')
    expect(relatedCategoryOf('note:width', 'width')).toBe('note')
    expect(relatedCategoryOf('description:surface', 'surface')).toBe('note')
    expect(relatedCategoryOf('check_date:surface', 'surface')).toBe('check_date')
    expect(relatedCategoryOf('source:cycleway:left:width', 'cycleway:left:width')).toBe('source')
  })

  it('ignores numbered keys, the field itself and unrelated keys', () => {
    expect(relatedCategoryOf('source:width:1', 'width')).toBeUndefined()
    expect(relatedCategoryOf('source:widths', 'width')).toBeUndefined()
    expect(relatedCategoryOf('width', 'width')).toBeUndefined()
    expect(relatedCategoryOf('source:cycleway:rightish', 'cycleway:right')).toBeUndefined()
  })
})

describe('assignRelatedTags', () => {
  it('gives each tag to the field of its key', () => {
    const fields = [
      { id: 'cycleway', keys: ['cycleway:left', 'cycleway:right'] },
      { id: 'cycleway/right/traffic_sign', keys: ['cycleway:right:traffic_sign'] },
      { id: 'width', keys: ['width'] },
    ]
    const tags = {
      width: '7',
      'source:width': 'Luftbild 2026',
      'note:width': 'at the bus stop',
      'cycleway:right:source': 'survey',
      'source:cycleway:right:traffic_sign': 'sign survey',
    }
    const result = assignRelatedTags(fields, tags)
    expect(result.get('width')?.map((tag) => tag.key)).toEqual(['source:width', 'note:width'])
    expect(result.get('cycleway')?.map((tag) => tag.key)).toEqual(['cycleway:right:source'])
    expect(result.get('cycleway/right/traffic_sign')?.map((tag) => tag.key)).toEqual([
      'source:cycleway:right:traffic_sign',
    ])
  })

  it('never takes a key that a field edits itself', () => {
    const fields = [
      { id: 'width', keys: ['width'] },
      { id: 'source/width', keys: ['source:width'] },
    ]
    expect(assignRelatedTags(fields, { width: '7', 'source:width': 'survey' }).size).toBe(0)
  })

  it('never takes a key that a field which is not an owner here edits itself', () => {
    const owners = [{ id: 'width', keys: ['width'] }]
    const result = assignRelatedTags(owners, { width: '7', 'source:width': 'survey' }, [
      'width',
      'source:width',
    ])
    expect(result.size).toBe(0)
  })
})

describe('relatedSide', () => {
  it('reads the side', () => {
    expect(relatedSide('cycleway:left:width')).toBe('left')
    expect(relatedSide('traffic_sign:forward')).toBe('forward')
    expect(relatedSide('width')).toBeUndefined()
  })
})

describe('relatedLabel', () => {
  const directional = field({
    id: 'cycleway',
    key: 'cycleway',
    keys: ['cycleway:left', 'cycleway:right', 'cycleway:both'],
  })

  it('names the side when the field has several keys and the tag is not about its own key', () => {
    expect(
      relatedLabel(
        { key: 'source:cycleway', category: 'source', baseKey: 'cycleway' },
        directional,
      ),
    ).toBe('Source')
    expect(
      relatedLabel(
        { key: 'source:cycleway:left', category: 'source', baseKey: 'cycleway:left' },
        directional,
      ),
    ).toBe('Source (left)')
    expect(
      relatedLabel(
        { key: 'check_date:cycleway:right', category: 'check_date', baseKey: 'cycleway:right' },
        directional,
      ),
    ).toBe('Checked (right)')
  })

  it('names only the category for a field with one key', () => {
    const width = field({ id: 'width', key: 'width' })
    expect(relatedLabel({ key: 'note:width', category: 'note', baseKey: 'width' }, width)).toBe(
      'Note',
    )
  })
})

describe('relatedButtonKeys', () => {
  const buttons: RelatedButtons = {
    cycleway: { check_date: 'check_date:cycleway' },
    'cycleway:right:width': { source: 'source:cycleway:right:width' },
    surface: { source: 'source:surface', check_date: 'check_date:surface' },
    smoothness: { check_date: 'check_date:smoothness' },
  }

  it('offers buttons for keys with a value', () => {
    const keys = relatedButtonKeys(
      ['surface', 'smoothness'],
      'surface',
      { surface: 'asphalt' },
      buttons,
    )
    expect(keys.map((key) => key.key)).toEqual(['source:surface', 'check_date:surface'])
  })

  it("offers the main key's buttons when another key of the field has a value", () => {
    const keys = relatedButtonKeys(
      ['cycleway', 'cycleway:left', 'cycleway:right'],
      'cycleway',
      { 'cycleway:right': 'track' },
      buttons,
    )
    expect(keys).toEqual([
      { key: 'check_date:cycleway', category: 'check_date', baseKey: 'cycleway' },
    ])
  })

  it('offers nothing for empty fields or keys without an entry', () => {
    expect(
      relatedButtonKeys(['cycleway:right:width'], 'cycleway:right:width', {}, buttons),
    ).toEqual([])
    expect(relatedButtonKeys(['name'], 'name', { name: 'Skalitzer Straße' }, buttons)).toEqual([])
  })

  it('leaves out a button whose related tag is set', () => {
    const keys = relatedButtonKeys(
      ['surface'],
      'surface',
      { surface: 'asphalt', 'source:surface': 'survey' },
      buttons,
    )
    expect(keys.map((key) => key.key)).toEqual(['check_date:surface'])
  })
})

describe('the field helpers ignore related tags', () => {
  it('neither counts a related tag as present, modified or to remove', () => {
    const width = field({ id: 'width', key: 'width' })
    const tags = { 'source:width': 'survey', 'note:width': 'bus stop' }
    expect(isPresent(width, tags)).toBe(false)
    expect(isModified(width, tags, {})).toBe(false)
    expect(removeEdits(width, tags)).toEqual([])
  })
})
