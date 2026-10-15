import { describe, expect, test } from 'bun:test'
import { buildAreaChain } from './area-chain.ts'
import { sceneOf, type TestWay } from './test-graph.ts'

const building = { building: 'yes' }

/**
 * A row of houses, each a unit square: house k has the corners (k,0) (k+1,0) (k+1,1) (k,1). Neighbours share a
 * side. The node ids are p<x>_<y>.
 */
function house(k: number, id = `H${k}`, tags: Record<string, string> = building): TestWay {
  const p = (x: number, y: number) => `p${x}_${y}`
  return { id, nodes: [p(k, 0), p(k + 1, 0), p(k + 1, 1), p(k, 1), p(k, 0)], tags }
}

describe('buildAreaChain', () => {
  test('houses that share a side form a row, left of the reference first', () => {
    const scene = sceneOf([house(0), house(1), house(2), house(3), house(4)])
    const chain = buildAreaChain(scene, 'H2', { maxPerSide: 3 })
    // H2's edges in node order meet H3 (its right side) before H1 (its left side), so H3 is the left neighbour.
    // The walk goes on across H3's far side to H4.
    expect(chain?.ways.map((way) => way.id)).toEqual(['H4', 'H3', 'H2', 'H1', 'H0'])
    expect(chain?.centerIndex).toBe(2)
    expect(chain?.stops).toEqual({ backward: 'end', forward: 'end' })
    expect(chain?.ways.every((way) => way.reversed === false)).toBe(true)
  })

  test('the limit per side applies to the areas', () => {
    const scene = sceneOf([house(0), house(1), house(2), house(3), house(4)])
    const chain = buildAreaChain(scene, 'H2', { maxPerSide: 1 })
    expect(chain?.ways.map((way) => way.id)).toEqual(['H3', 'H2', 'H1'])
    expect(chain?.stops).toEqual({ backward: 'limit', forward: 'limit' })
  })

  test('a corner shared by one node only is not a neighbour', () => {
    // K touches H2 at p3_1 only: its edges are not H2's edges
    const corner: TestWay = {
      id: 'K',
      nodes: ['p3_1', 'p4_2', 'p5_2', 'p5_1', 'p3_1'],
      tags: building,
    }
    const chain = buildAreaChain(sceneOf([house(0), house(1), house(2), corner]), 'H2', {
      maxPerSide: 3,
    })
    // only H1 adjoins H2 (K shares the corner p3_1 and no side), so the chain is H0, H1, H2
    expect(chain?.ways.map((way) => way.id)).toEqual(['H0', 'H1', 'H2'])
  })

  test('two unseen neighbours on the far side of a neighbour are a junction', () => {
    const above: TestWay = {
      id: 'X',
      nodes: ['p3_1', 'p4_1', 'p4_2', 'p3_2', 'p3_1'],
      tags: building,
    }
    const below: TestWay = {
      id: 'Y',
      nodes: ['p3_-1', 'p4_-1', 'p4_0', 'p3_0', 'p3_-1'],
      tags: building,
    }
    const chain = buildAreaChain(
      sceneOf([house(0), house(1), house(2), house(3), above, below]),
      'H2',
      {
        maxPerSide: 3,
      },
    )
    expect(chain?.stops.backward).toBe('junction')
    expect(chain?.junctions.length).toBe(1)
    expect([...(chain?.junctions[0]?.candidates ?? [])].sort()).toEqual(['X', 'Y'])
    // H3 is the left neighbour; its two unseen neighbours make the junction, so the left side is H3 alone.
    expect(chain?.ways.map((way) => way.id)).toEqual(['H3', 'H2', 'H1', 'H0'])
    expect(chain?.centerIndex).toBe(1)
  })

  test('only closed ways with a building tag other than no count as neighbours by default', () => {
    const notBuildings = [
      sceneOf([house(0), house(1, 'H1', { landuse: 'retail' }), house(2)]),
      sceneOf([house(0), house(1, 'H1', { building: 'no' }), house(2)]),
    ]
    for (const scene of notBuildings) {
      expect(buildAreaChain(scene, 'H2', { maxPerSide: 3 })?.ways.map((way) => way.id)).toEqual([
        'H2',
      ])
    }
    const custom = buildAreaChain(
      sceneOf([house(0), house(1, 'H1', { landuse: 'retail' }), house(2)]),
      'H2',
      {
        maxPerSide: 3,
        isNeighbour: () => true,
      },
    )
    // H1 is the only neighbour of H2 (H3 is not loaded); the walk goes on across H1's far side to H0
    expect(custom?.ways.map((way) => way.id)).toEqual(['H0', 'H1', 'H2'])
    expect(custom?.centerIndex).toBe(2)
  })

  test('an open way is not an area chain', () => {
    const open: TestWay = { id: 'O', nodes: ['p0_0', 'p1_0', 'p1_1'], tags: building }
    expect(buildAreaChain(sceneOf([open]), 'O')).toBeUndefined()
  })

  test('the reference is a loaded closed way, and an unknown id gives nothing', () => {
    expect(buildAreaChain(sceneOf([house(0)]), 'nope')).toBeUndefined()
    expect(buildAreaChain(sceneOf([house(0)]), 'H0')?.ways).toEqual([{ id: 'H0', reversed: false }])
  })
})
