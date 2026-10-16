import { describe, expect, it } from 'bun:test'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import { m } from '../messages.ts'
import { cutCheck } from './cut.ts'
import { cutOperation } from './operation.ts'
import { graphOf, node, relation, square, way } from './test-graph.ts'

/** The selection of one entity in the graph, as the editor's operation context has it */
function selecting(graph: OperationContext['graph'], ...selected: string[]): OperationContext {
  return { graph, selected }
}

describe('cut: the edit menu offers it for one area or one multipolygon', () => {
  it('applies to one closed way that is an area', () => {
    const graph = graphOf(...square())
    expect(cutOperation.applies(selecting(graph, 'w1'))).toBe(true)
  })

  it('does not apply to an open line, a point, or two areas', () => {
    const line = graphOf(
      ...square(),
      node('p1', 20, 20),
      way('w2', ['n0', 'n1'], { highway: 'service' }),
    )
    expect(cutOperation.applies(selecting(line, 'w2'))).toBe(false)
    expect(cutOperation.applies(selecting(line, 'p1'))).toBe(false)
    expect(cutOperation.applies(selecting(line, 'w1', 'w2'))).toBe(false)
    expect(cutOperation.applies(selecting(line))).toBe(false)
  })

  it('does not apply to a closed way that is no area and is no outer member', () => {
    const loop = graphOf(
      node('a', 0, 0),
      node('b', 10, 0),
      node('c', 10, 10),
      way('w3', ['a', 'b', 'c', 'a'], { highway: 'service' }),
    )
    expect(cutOperation.applies(selecting(loop, 'w3'))).toBe(false)
  })

  it('applies to a multipolygon, and to a closed way that is its outer member without area tags', () => {
    const multi = graphOf(
      ...square({}),
      relation('r1', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
      ]),
    )
    expect(cutOperation.applies(selecting(multi, 'r1'))).toBe(true)
    expect(cutOperation.applies(selecting(multi, 'w1'))).toBe(true)
  })

  it('does not apply to a relation that is not a multipolygon', () => {
    const route = graphOf(
      ...square(),
      relation('r2', { type: 'route', route: 'bicycle' }, [{ id: 'w1', type: 'way', role: '' }]),
    )
    expect(cutOperation.applies(selecting(route, 'r2'))).toBe(false)
  })
})

describe('cut: refusals that need no line are sentences', () => {
  it('is enabled for a plain square', () => {
    const graph = graphOf(...square())
    expect(cutOperation.disabled(selecting(graph, 'w1'))).toBeUndefined()
    expect(cutCheck(graph, 'w1')).toBeUndefined()
  })

  it('refuses a way that is a member of a route, with the reason as a sentence', () => {
    const graph = graphOf(
      ...square(),
      relation('r2', { type: 'route', route: 'bicycle' }, [{ id: 'w1', type: 'way', role: '' }]),
    )
    expect(cutOperation.disabled(selecting(graph, 'w1'))).toBe(m.cut_refusal_relation_member())
  })

  it('refuses a roundabout', () => {
    const graph = graphOf(...square({ building: 'yes', junction: 'roundabout' }))
    expect(cutOperation.disabled(selecting(graph, 'w1'))).toBe(m.cut_refusal_roundabout())
  })

  it('refuses an outline that crosses itself', () => {
    // a bow tie: the two diagonals cross in the middle
    const graph = graphOf(
      node('n0', 0, 0),
      node('n1', 10, 10),
      node('n2', 10, 0),
      node('n3', 0, 10),
      way('w4', ['n0', 'n1', 'n2', 'n3', 'n0'], { building: 'yes' }),
    )
    expect(cutOperation.disabled(selecting(graph, 'w4'))).toBe(m.cut_refusal_self_intersecting())
  })

  it('refuses a multipolygon with two outlines', () => {
    const graph = graphOf(
      ...square(),
      node('m0', 20, 0),
      node('m1', 30, 0),
      node('m2', 30, 10),
      node('m3', 20, 10),
      way('w5', ['m0', 'm1', 'm2', 'm3', 'm0'], {}),
      relation('r3', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
        { id: 'w5', type: 'way', role: 'outer' },
      ]),
    )
    expect(cutOperation.disabled(selecting(graph, 'r3'))).toBe(m.cut_refusal_several_outlines())
  })

  it('refuses a multipolygon with no outer member', () => {
    const graph = graphOf(
      ...square(),
      relation('r4', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'inner' },
      ]),
    )
    expect(cutOperation.disabled(selecting(graph, 'r4'))).toBe(m.cut_no_outline())
  })

  it('takes the outer way of a multipolygon for the cut, so a plain outline is enabled through it', () => {
    const graph = graphOf(
      ...square({}),
      relation('r5', { type: 'multipolygon', building: 'yes' }, [
        { id: 'w1', type: 'way', role: 'outer' },
      ]),
    )
    expect(cutOperation.disabled(selecting(graph, 'r5'))).toBeUndefined()
  })
})

describe('cut: the operation makes no change of its own', () => {
  it('starts the mode through start and returns no actions from run', () => {
    const graph = graphOf(...square())
    const result = cutOperation.run(selecting(graph, 'w1'))
    expect(result.actions).toEqual([])
    expect(typeof cutOperation.start).toBe('function')
  })

  it('does nothing when no map is bound to draw on', () => {
    const graph = graphOf(...square())
    expect(() => cutOperation.start?.(selecting(graph, 'w1'))).not.toThrow()
  })

  it('has its label and sentences in the page language, and no shortcut', () => {
    expect(cutOperation.label).toBe(m.cut_label())
    expect(cutOperation.shortcut).toBeUndefined()
    expect(cutOperation.id).toBe('cut-area')
  })
})
