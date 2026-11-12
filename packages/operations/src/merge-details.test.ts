// What blocks Merge, as the table beside the edit menu: the conflicting tags and relations first, and the direction
// tags of a line the join reverses, as the join compares them.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmRelation, OsmWay } from '@osm-editor-kit/maid-model'
import { relationRows, tagRows } from './merge-details.ts'
import { mergeOperation } from './merge.ts'

const context = new ModelContext()
const node = (id: string, lon: number) => new OsmNode(context, { id, loc: [lon, 0] })
const way = (id: string, nodes: string[], tags: Record<string, string>) =>
  new OsmWay(context, { id, nodes, tags })

/** Two lines a–b–c joined at b; `w2` runs c→b when `reversed` */
function lines(
  t1: Record<string, string>,
  t2: Record<string, string>,
  reversed = false,
  ...more: OsmRelation[]
) {
  return new Graph(context, [
    ...more,
    node('n1', 0),
    node('n2', 0.001),
    node('n3', 0.002),
    way('w1', ['n1', 'n2'], t1),
    way('w2', reversed ? ['n3', 'n2'] : ['n2', 'n3'], t2),
  ])
}

describe('tagRows', () => {
  it('puts the keys with different values first, and a key on one feature only is no conflict', () => {
    const graph = lines(
      { highway: 'cycleway', surface: 'asphalt', name: 'A' },
      { highway: 'cycleway', surface: 'paving_stones', lit: 'yes' },
    )
    const rows = tagRows([graph.entity('w1'), graph.entity('w2')])
    expect(rows.map((row) => [row.label, row.conflict])).toEqual([
      ['surface', true],
      ['highway', false],
      ['lit', false],
      ['name', false],
    ])
    expect(rows[0]!.cells).toEqual(['asphalt', 'paving_stones'])
    expect(rows[2]!.cells).toEqual([undefined, 'yes'])
  })

  it('with strict, a key one feature lacks conflicts too, but not an ignored one', () => {
    const graph = lines({ building: 'yes', area: 'yes' }, { building: 'yes', roof: 'flat' })
    const rows = tagRows([graph.entity('w1'), graph.entity('w2')], {
      strict: true,
      ignore: ['area'],
    })
    expect(rows.filter((row) => row.conflict).map((row) => row.label)).toEqual(['roof'])
  })
})

describe('relationRows', () => {
  it('marks a relation that not every line is in, with the roles as cells', () => {
    const route = new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'route', name: 'Spreeweg' },
      members: [{ id: 'w1', type: 'way', role: '' }],
    })
    const graph = lines({ highway: 'path' }, { highway: 'path' }, false, route)
    const rows = relationRows([graph.entity('w1'), graph.entity('w2')], graph)
    expect(rows).toEqual([{ label: 'Spreeweg (r1)', cells: ['member', undefined], conflict: true }])
  })
})

describe('mergeOperation.details', () => {
  it('shows the conflicting tags of two lines with the sentence as the title', () => {
    const graph = lines({ highway: 'cycleway', surface: 'asphalt' }, { highway: 'footway' })
    const ctx = { graph, selected: ['w1', 'w2'] }
    expect(mergeOperation.disabled(ctx)).toContain('conflicting values')
    const details = mergeOperation.details?.(ctx)
    expect(details?.title).toBe(mergeOperation.disabled(ctx))
    expect(details?.columns.map((column) => column.id)).toEqual(['w1', 'w2'])
    expect(details?.rows[0]).toEqual({
      label: 'highway',
      cells: ['cycleway', 'footway'],
      conflict: true,
    })
  })

  it('shows the direction tags of a reversed line turned, as the join compares them', () => {
    // w2 runs the other way: its cycleway:left is w1's cycleway:right once reversed, so nothing conflicts there
    const graph = lines(
      { highway: 'residential', 'cycleway:right': 'lane', surface: 'asphalt' },
      { highway: 'residential', 'cycleway:left': 'lane', surface: 'sett' },
      true,
    )
    const details = mergeOperation.details?.({ graph, selected: ['w1', 'w2'] })
    const reversed = details?.columns.find((column) => column.id === 'w2')
    expect(reversed?.note).toBe('reversed')
    const conflicts = details?.rows.filter((row) => row.conflict).map((row) => row.label)
    expect(conflicts).toEqual(['surface'])
    expect(details?.rows.find((row) => row.label === 'cycleway:right')?.cells).toEqual([
      'lane',
      'lane',
    ])
  })

  it('has none when Merge can run or is refused for another reason', () => {
    expect(
      mergeOperation.details?.({
        graph: lines({ highway: 'path' }, { highway: 'path' }),
        selected: ['w1', 'w2'],
      }),
    ).toBeUndefined()
  })
})
