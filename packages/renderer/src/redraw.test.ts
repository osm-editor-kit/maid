import { describe, expect, test } from 'bun:test'
import { type Difference, ModelContext, OsmWay } from '@osm-editor-kit/maid-model'
import { movedOf } from './redraw'

describe('movedOf (what a change redraws)', () => {
  const context = new ModelContext()
  const change = (base: OsmWay, head: OsmWay) =>
    ({ changes: new Map([[base.id, { base, head }]]) }) as unknown as Difference

  test('a way whose tags changed redraws its nodes: whether one is a junction depends on them (build.ts isJunction)', () => {
    const base = new OsmWay(context, {
      id: 'w1',
      nodes: ['n1', 'n2'],
      tags: { highway: 'footway' },
    })
    const head = base.update({ tags: { building: 'yes' } })
    const moved = movedOf([change(base, head)])
    expect([...moved]).toEqual([
      ['w1', true],
      ['n1', false],
      ['n2', false],
    ])
  })
})
