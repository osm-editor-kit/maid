import { describe, expect, it } from 'bun:test'
import { graphOf, node, relation, uniqueById, validateChanged, way } from '../id-test-helpers.ts'
import { boundaryNotClosed } from './boundary-not-closed.ts'

// A triangle of three nodes, which the outer ways of a boundary go round.
function corners() {
  return [node('a', 0, 0), node('b', 0.01, 0), node('c', 0.005, 0.01)]
}

const admin = { type: 'boundary', boundary: 'administrative', admin_level: '8' }

describe('boundary_not_closed', () => {
  it('has no issue for a closed administrative boundary', () => {
    const graph = graphOf(
      ...corners(),
      way('w-1', ['a', 'b']),
      way('w-2', ['b', 'c']),
      way('w-3', ['c', 'a']),
      relation(
        'r-1',
        [
          { id: 'w-1', type: 'way', role: 'outer' },
          { id: 'w-2', type: 'way', role: 'outer' },
          { id: 'w-3', type: 'way', role: 'outer' },
        ],
        admin,
      ),
    )
    expect(validateChanged(boundaryNotClosed, graph, ['r-1'])).toEqual([])
  })

  it('has no issue for a boundary whose outer way is one closed way', () => {
    const graph = graphOf(
      ...corners(),
      way('w-1', ['a', 'b', 'c', 'a']),
      relation('r-1', [{ id: 'w-1', type: 'way', role: 'outer' }], admin),
    )
    expect(validateChanged(boundaryNotClosed, graph, ['r-1'])).toEqual([])
  })

  it('reports each open end, at the end, when the outer ways do not close', () => {
    const graph = graphOf(
      ...corners(),
      way('w-1', ['a', 'b']),
      way('w-2', ['b', 'c']),
      relation(
        'r-1',
        [
          { id: 'w-1', type: 'way', role: 'outer' },
          { id: 'w-2', type: 'way', role: 'outer' },
        ],
        admin,
      ),
    )
    const issues = uniqueById(validateChanged(boundaryNotClosed, graph, ['r-1']))
    expect(issues.map((issue) => issue.id).sort()).toEqual([
      'boundary_not_closed:r-1:a',
      'boundary_not_closed:r-1:c',
    ])
    const open = issues.find((issue) => issue.id === 'boundary_not_closed:r-1:c')
    expect(open?.rule).toBe('boundary_not_closed')
    expect(open?.severity).toBe('warning')
    expect(open?.fixes).toEqual([])
    expect(open?.entityIds).toEqual(['r-1', 'c', 'w-2'])
    expect(open?.loc).toEqual([0.005, 0.01])
  })

  it('does not judge an incomplete boundary: an outer way that is not loaded', () => {
    const graph = graphOf(
      ...corners(),
      way('w-1', ['a', 'b']),
      way('w-2', ['b', 'c']),
      relation(
        'r-1',
        [
          { id: 'w-1', type: 'way', role: 'outer' },
          { id: 'w-2', type: 'way', role: 'outer' },
          { id: 'w-3', type: 'way', role: 'outer' },
        ],
        admin,
      ),
    )
    expect(validateChanged(boundaryNotClosed, graph, ['r-1'])).toEqual([])
  })

  it('does not check a relation that is not a boundary', () => {
    const graph = graphOf(
      ...corners(),
      way('w-1', ['a', 'b']),
      relation('r-1', [{ id: 'w-1', type: 'way', role: 'outer' }], { type: 'multipolygon' }),
    )
    expect(validateChanged(boundaryNotClosed, graph, ['r-1'])).toEqual([])
  })
})
