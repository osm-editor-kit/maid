import { describe, expect, it } from 'bun:test'
import {
  EditHistory,
  ModelContext,
  OsmNode,
  OsmWay,
  actionAddEntity,
  actionAddVertex,
  actionChangeTags,
  actionDeleteWay,
  actionMoveNode,
} from '@osm-editor-kit/maid-model'
import { changesetTags, imageryUsedValue, summaryOf, toOsmChange } from './osm-change.ts'

function history() {
  const context = new ModelContext()
  const edits = new EditHistory(context)
  edits.merge([
    new OsmNode(context, { id: 'n1', loc: [13, 52], version: 3 }),
    new OsmNode(context, { id: 'n2', loc: [13.5, 52.25], version: 1 }),
    new OsmNode(context, { id: 'n5', loc: [13.6, 52.3], version: 2, tags: { amenity: 'bench' } }),
    new OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'], version: 7, tags: { highway: 'path' } }),
    new OsmNode(context, { id: 'n3', loc: [14, 52], version: 1 }),
    new OsmNode(context, { id: 'n4', loc: [14.5, 52], version: 1 }),
    new OsmWay(context, { id: 'w2', nodes: ['n3', 'n4'], version: 2, tags: { barrier: 'wall' } }),
  ])
  return { context, edits }
}

describe('toOsmChange', () => {
  it('lists created, changed and deleted elements with ids, versions and geometry', () => {
    const { context, edits } = history()
    const node = new OsmNode(context, { loc: [13.1, 52.1], tags: { amenity: 'cafe' } })
    edits.perform(actionAddEntity(node))
    edits.commit({ annotation: 'add' })
    edits.perform(
      actionChangeTags('w1', { highway: 'footway' }),
      actionMoveNode('n5', [13.7, 52.3]),
    )
    edits.commit({ annotation: 'change' })
    edits.perform(actionDeleteWay('w2'))
    edits.commit({ annotation: 'delete' })

    const change = toOsmChange(edits.changes())
    expect(change.create).toHaveLength(1)
    expect(change.create[0]).toMatchObject({
      type: 'node',
      lon: 13.1,
      lat: 52.1,
      version: 0,
      tags: { amenity: 'cafe' },
    })
    expect(change.create[0]!.id).toBeLessThan(0)
    expect(change.modify).toEqual([
      { type: 'node', id: 5, version: 2, tags: { amenity: 'bench' }, lon: 13.7, lat: 52.3 },
      { type: 'way', id: 1, version: 7, tags: { highway: 'footway' }, nodes: [1, 2] },
    ])
    // the way goes before the nodes it used
    expect(change.delete.map((e) => `${e.type}${e.id}`)).toEqual(['way2', 'node3', 'node4'])
    expect(summaryOf(change)).toBe('1 created, 2 changed, 3 deleted')
  })

  it('uploads a point that became a vertex of a way as changed, not as deleted', () => {
    const { context, edits } = history()
    edits.merge([
      new OsmNode(context, { id: 'n9', loc: [13.8, 52.4], version: 4, tags: { power: 'pole' } }),
    ])
    edits.perform(actionAddVertex('w2', 'n9'), actionChangeTags('n9', { power: 'pole', ref: '42' }))
    edits.commit({ annotation: 'make the pole a vertex of the way' })

    const change = toOsmChange(edits.changes())
    expect(change.delete).toEqual([])
    expect(change.create).toEqual([])
    expect(change.modify.map((e) => `${e.type}${e.id}`)).toEqual(['node9', 'way2'])
    expect(change.modify[0]).toMatchObject({
      type: 'node',
      id: 9,
      version: 4,
      tags: { power: 'pole', ref: '42' },
      lon: 13.8,
      lat: 52.4,
    })
    expect(change.modify[1]).toMatchObject({ type: 'way', id: 2, nodes: [3, 4, 9] })
  })

  it('is empty without edits', () => {
    const change = toOsmChange(history().edits.changes())
    expect(change).toEqual({ create: [], modify: [], delete: [] })
    expect(summaryOf(change)).toBe('')
  })
})

describe('changesetTags', () => {
  it('sets the editor and the trimmed comment', () => {
    expect(changesetTags('  Added a cafe ', '0.1')).toEqual({
      created_by: 'Maid 0.1',
      comment: 'Added a cafe',
    })
  })

  it('collects hashtags from the comment, each once', () => {
    expect(changesetTags('Paths #radnetz and #berlin, again #radnetz.', '0.1').hashtags).toBe(
      '#radnetz;#berlin',
    )
  })

  it('writes the imagery on the map as imagery_used, background first', () => {
    expect(changesetTags('Added a cafe', '0.1', ['Bing aerial imagery', 'Road overlay'])).toEqual({
      created_by: 'Maid 0.1',
      comment: 'Added a cafe',
      imagery_used: 'Bing aerial imagery;Road overlay',
    })
  })

  it('leaves imagery_used out when no imagery is on the map', () => {
    expect(changesetTags('Added a cafe', '0.1', [])).not.toHaveProperty('imagery_used')
    expect(changesetTags('Added a cafe', '0.1')).not.toHaveProperty('imagery_used')
  })
})

describe('imageryUsedValue', () => {
  it('joins the names with ";" and trims each one', () => {
    expect(imageryUsedValue([' Bing aerial imagery ', 'DOP 20 (Berlin)'])).toBe(
      'Bing aerial imagery;DOP 20 (Berlin)',
    )
  })

  it('lists a name once', () => {
    expect(imageryUsedValue(['Bing aerial imagery', 'Bing aerial imagery'])).toBe(
      'Bing aerial imagery',
    )
  })

  it('cuts the value to 255 characters, as iD does', () => {
    const first = 'a'.repeat(200)
    const value = imageryUsedValue([first, 'b'.repeat(200)])
    expect(value).toHaveLength(255)
    expect(value.startsWith(`${first};`)).toBe(true)
  })

  it('is empty without names', () => {
    expect(imageryUsedValue([])).toBe('')
    expect(imageryUsedValue(['  '])).toBe('')
  })
})

describe('toOsmChange tags', () => {
  it('uploads a created node with the spaces around its value removed', () => {
    const { context, edits } = history()
    const node = new OsmNode(context, {
      loc: [13.1, 52.1],
      tags: { amenity: 'cafe', name: '  Café Nord   ', 'contact:phone': ' +49 30 1 ' },
    })
    edits.perform(actionAddEntity(node))
    edits.commit({ annotation: 'add' })

    const change = toOsmChange(edits.changes())
    expect(change.create[0]!.tags).toEqual({
      amenity: 'cafe',
      name: 'Café Nord',
      'contact:phone': '+49 30 1',
    })
  })

  it('does not upload a key whose value is empty', () => {
    const { context, edits } = history()
    const node = new OsmNode(context, {
      loc: [13.1, 52.1],
      tags: { amenity: 'bench', name: '', operator: '  ' },
    })
    edits.perform(actionAddEntity(node))
    edits.commit({ annotation: 'add' })

    const change = toOsmChange(edits.changes())
    expect(change.create[0]!.tags).toEqual({ amenity: 'bench' })
  })

  it('uploads a description as typed, with its inner text and spaces', () => {
    const { context, edits } = history()
    const text = '  Two  rooms;  open   Mondays  '
    const node = new OsmNode(context, {
      loc: [13.1, 52.1],
      tags: { amenity: 'cafe', description: text },
    })
    edits.perform(actionAddEntity(node))
    edits.commit({ annotation: 'add' })

    const change = toOsmChange(edits.changes())
    expect(change.create[0]!.tags).toEqual({ amenity: 'cafe', description: text })
  })

  it('cleans the copy that is uploaded and leaves the editor entity as it is', () => {
    const { context, edits } = history()
    const node = new OsmNode(context, {
      loc: [13.1, 52.1],
      tags: { amenity: 'cafe', name: '  Café Nord  ' },
    })
    edits.perform(actionAddEntity(node))
    edits.commit({ annotation: 'add' })
    const created = edits.changes().created[0]!

    const change = toOsmChange(edits.changes())
    expect(change.create[0]!.tags.name).toBe('Café Nord')
    expect(created.tags.name).toBe('  Café Nord  ')
    expect(node.tags.name).toBe('  Café Nord  ')
  })
})
