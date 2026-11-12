import { describe, expect, it } from 'bun:test'
import { distance, type GraphEntity, type GraphLike, scorecard } from './holes.ts'

function graphOf(base: GraphEntity[], local: GraphEntity[] = []): GraphLike {
  const baseMap = new Map(base.map((entity) => [entity.id, entity]))
  const localMap = new Map(local.map((entity) => [entity.id, entity]))
  return {
    base: { entities: baseMap },
    local: { entities: localMap },
    hasEntity: (id) => (localMap.has(id) ? localMap.get(id) : baseMap.get(id)),
  }
}

// 0.001° of latitude is about 111 m
const nodes: GraphEntity[] = [
  { id: 'n1', tags: {}, loc: [13, 52] },
  { id: 'n2', tags: {}, loc: [13, 52.001] },
  { id: 'n3', tags: {}, loc: [13, 52.003] },
]

describe('scorecard', () => {
  it('measures along the line', () => {
    expect(Math.round(distance([13, 52], [13, 52.001]))).toBe(111)
  })

  it('lists the holes by number, with their length and what is missing', () => {
    const card = scorecard(
      graphOf([
        ...nodes,
        {
          id: 'w10',
          tags: { golf: 'hole', ref: '10', par: '4', handicap: '3' },
          nodes: ['n1', 'n2'],
        },
        { id: 'w2', tags: { golf: 'hole', ref: '2', par: '5' }, nodes: ['n1', 'n2', 'n3'] },
        { id: 'w0', tags: { golf: 'hole' }, nodes: ['n1', 'n2'] },
        { id: 'w9', tags: { golf: 'green' }, nodes: ['n1', 'n2'] },
      ]),
    )
    expect(card.rows.map((row) => row.ref)).toEqual(['2', '10', undefined])
    expect(card.rows[0]?.length).toBe(334)
    expect(card.rows[0]?.missing).toEqual(['handicap'])
    expect(card.rows[1]?.missing).toEqual([])
    expect(card.rows[2]?.missing).toEqual(['ref', 'par', 'handicap'])
    expect(card.par).toBe(9)
  })

  it('reads the edits over the loaded data and marks a number used twice', () => {
    const card = scorecard(
      graphOf(
        [...nodes, { id: 'w1', tags: { golf: 'hole', ref: '1' }, nodes: ['n1', 'n2'] }],
        [
          {
            id: 'w1',
            tags: { golf: 'hole', ref: '1', par: '3', handicap: '9' },
            nodes: ['n1', 'n2'],
          },
          {
            id: 'w-1',
            tags: { golf: 'hole', ref: '1', par: '4', handicap: '1' },
            nodes: ['n2', 'n3'],
          },
        ],
      ),
    )
    expect(card.rows).toHaveLength(2)
    expect(card.rows.every((row) => row.missing.includes('duplicate'))).toBe(true)
  })
})
