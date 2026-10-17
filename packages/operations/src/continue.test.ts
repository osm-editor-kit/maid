// Continue, as iD's operation of that name: the rules of iD's modules/operations/continue.js, with the
// texts of en/core.yaml. Applicability, the two reasons it cannot run, and the start that draws on from the end.
import { describe, expect, it } from 'bun:test'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { continueOperation } from './continue.ts'
import type { OperationContext } from './types.ts'

const context = new ModelContext()

const node = (id: string, lon = 0, lat = 0, tags: Record<string, string> = {}) =>
  new OsmNode(context, { id, loc: [lon, lat], tags })
const way = (id: string, nodes: string[], tags: Record<string, string> = {}) =>
  new OsmWay(context, { id, nodes, tags })

const graphOf = (...entities: OsmEntity[]) => new Graph(context, entities)
const at = (graph: Graph, selected: string[]): OperationContext => ({ graph, selected })

/** A host that records what the operation asks of the engine, as the renderer's would be */
function hostWith(startAt: boolean) {
  const calls: unknown[][] = []
  const engine = {
    setMode: (mode: string) => {
      calls.push(['setMode', mode])
      return true
    },
    draw: {
      startAt: (nodeId: string, wayId?: string) => {
        calls.push(['startAt', nodeId, wayId])
        return startAt
      },
    },
  }
  return { host: { engine, editor: {} } as never, calls }
}

/** Two lines end at n1 (w1 from n1 to n2, w2 from n4 to n1); n2 is in the middle of w1; a closed building is at n5 */
const scene = graphOf(
  node('n1', 0, 0),
  node('n2', 0.001, 0),
  node('n3', 0.002, 0),
  node('n4', 0, 0.001),
  node('n5', 1, 1),
  node('n6', 1, 1.001),
  node('n7', 1.001, 1.001),
  node('n8', 2, 2),
  node('n9', 2.001, 2),
  node('n10', 3, 3),
  node('n11', 3.001, 3),
  way('w1', ['n1', 'n2', 'n3'], { highway: 'footway' }),
  way('w2', ['n4', 'n1'], { highway: 'steps' }),
  way('w3', ['n5', 'n6', 'n7', 'n5'], { building: 'yes' }),
  way('w4', ['n8', 'n9'], { highway: 'path' }),
  way('w5', ['n10', 'n11'], { highway: 'path', area: 'yes' }),
)

describe('Continue: what it applies to', () => {
  it('applies to the end of one open line, and is offered with its key and icon', () => {
    expect(continueOperation.id).toBe('continue')
    expect(continueOperation.label).toBe('Continue')
    expect(continueOperation.shortcut).toBe('a')
    expect(continueOperation.icon).toBe('iD-operation-continue')
    expect(continueOperation.applies(at(scene, ['n3']))).toBe(true)
  })

  it('applies to the vertex with the one line that it ends, selected together', () => {
    expect(continueOperation.applies(at(scene, ['n3', 'w1']))).toBe(true)
  })

  it('does not apply to a vertex in the middle of a line', () => {
    expect(continueOperation.applies(at(scene, ['n2']))).toBe(false)
  })

  it('does not apply to a vertex of a closed way only', () => {
    expect(continueOperation.applies(at(scene, ['n5']))).toBe(false)
  })

  it('does not apply to an open way with area=yes: the drawing tool continues lines only', () => {
    expect(continueOperation.applies(at(scene, ['n10']))).toBe(false)
  })

  it('does not apply to a line alone, to two vertices, or to a point with nothing to continue', () => {
    expect(continueOperation.applies(at(scene, ['w1']))).toBe(false)
    expect(continueOperation.applies(at(scene, ['n1', 'n3']))).toBe(false)
    expect(continueOperation.applies(at(scene, []))).toBe(false)
    const lonely = graphOf(node('n20', 5, 5))
    expect(continueOperation.applies(at(lonely, ['n20']))).toBe(false)
  })

  it('applies to a line end with an unrelated line selected too: disabled then says why', () => {
    // n8 starts w4; the selected w1 is not that line, so applies holds and disabled refuses (see below)
    expect(continueOperation.applies(at(scene, ['n8', 'w1']))).toBe(true)
    expect(continueOperation.applies(at(scene, ['n5', 'w4']))).toBe(false)
  })
})

describe('Continue: the two reasons it cannot run, as iD words them', () => {
  it('is enabled for the end of one line, and for that end with its line selected', () => {
    expect(continueOperation.disabled(at(scene, ['n3']))).toBeUndefined()
    expect(continueOperation.disabled(at(scene, ['n3', 'w1']))).toBeUndefined()
  })

  it('says "multiple" when two lines end at the vertex and only the vertex is selected', () => {
    expect(continueOperation.disabled(at(scene, ['n1']))).toBe(
      'Several lines can be continued here. Add one to the selection to continue.',
    )
  })

  it('is enabled when one of the two lines is selected with the vertex', () => {
    expect(continueOperation.disabled(at(scene, ['n1', 'w1']))).toBeUndefined()
    expect(continueOperation.disabled(at(scene, ['n1', 'w2']))).toBeUndefined()
  })

  it('says "not eligible" when the selected line does not end at the vertex', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 0.001, 0),
      node('n4', 0, 0.001),
      node('n8', 2, 2),
      node('n9', 2.001, 2),
      way('w1', ['n1', 'n2'], { highway: 'footway' }),
      way('w4', ['n8', 'n9'], { highway: 'path' }),
    )
    expect(continueOperation.applies(at(graph, ['n1', 'w4']))).toBe(true)
    expect(continueOperation.disabled(at(graph, ['n1', 'w4']))).toBe(
      'No line can be continued here.',
    )
  })
})

describe('Continue: how it starts', () => {
  it('starts the line drawing at the vertex, continuing the line that is named, from the end', () => {
    const { host, calls } = hostWith(true)
    continueOperation.start?.(at(scene, ['n3']), host)
    expect(calls).toEqual([
      ['setMode', 'draw-line'],
      ['startAt', 'n3', 'w1'],
    ])
  })

  it('names the selected line when there is one', () => {
    const { host, calls } = hostWith(true)
    continueOperation.start?.(at(scene, ['n1', 'w2']), host)
    expect(calls).toEqual([
      ['setMode', 'draw-line'],
      ['startAt', 'n1', 'w2'],
    ])
  })

  it('goes back to browsing when the drawing does not start', () => {
    const { host, calls } = hostWith(false)
    continueOperation.start?.(at(scene, ['n3']), host)
    expect(calls.at(-1)).toEqual(['setMode', 'browse'])
  })

  it('starts nothing for a vertex with several lines and none selected', () => {
    const { host, calls } = hostWith(true)
    continueOperation.start?.(at(scene, ['n1']), host)
    expect(calls).toEqual([])
  })

  it('has run return no actions: nothing changes until the line is drawn', () => {
    expect(continueOperation.run(at(scene, ['n3'])).actions).toEqual([])
  })
})
