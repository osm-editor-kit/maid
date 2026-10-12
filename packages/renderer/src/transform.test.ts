import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import {
  actionMove,
  actionMoveNode,
  EditHistory,
  Graph,
  ModelContext,
  OsmNode,
  type OsmJsonElement,
} from '@osm-editor-kit/maid-model'
import { OsmData } from './data'
import type { MaidEngine } from './engine'
import { actionMoveNodes, toMercator, TransformTool, worldDelta } from './transform'

describe('worldDelta', () => {
  test('actionMove moves a node by it onto the pointer, north and east', () => {
    const context = new ModelContext()
    const from: [number, number] = [13.4, 52.5]
    const to: [number, number] = [13.41, 52.52]
    const graph = new Graph(context, [new OsmNode(context, { id: 'n1', loc: from })])

    const result = actionMove(
      ['n1'],
      worldDelta(toMercator(from), toMercator(to)),
    )(new Graph(graph))
    const loc = (result.entity('n1') as OsmNode).loc as [number, number]

    expect(loc[0]).toBeCloseTo(to[0], 9)
    expect(loc[1]).toBeCloseTo(to[1], 9)
  })

  test('south and west, and no move for the same point', () => {
    const context = new ModelContext()
    const from: [number, number] = [-0.12, 51.5]
    const to: [number, number] = [-0.13, 51.49]
    const graph = new Graph(context, [new OsmNode(context, { id: 'n1', loc: from })])

    const moved = actionMove(['n1'], worldDelta(toMercator(from), toMercator(to)))(new Graph(graph))
    const loc = (moved.entity('n1') as OsmNode).loc as [number, number]
    expect(loc[0]).toBeCloseTo(to[0], 9)
    expect(loc[1]).toBeCloseTo(to[1], 9)

    const none = worldDelta(toMercator(from), toMercator(from))
    expect(none[0]).toBeCloseTo(0, 12)
    expect(none[1]).toBeCloseTo(0, 12)
  })
})

/** A building of four nodes, in the history, as the editor has it */
function building() {
  const context = new ModelContext()
  const history = new EditHistory(context)
  const data = new OsmData(context, history)
  const elements: OsmJsonElement[] = [
    { type: 'node', id: 1, lat: 52.5, lon: 13.4 },
    { type: 'node', id: 2, lat: 52.5, lon: 13.41 },
    { type: 'node', id: 3, lat: 52.51, lon: 13.41 },
    { type: 'node', id: 4, lat: 52.51, lon: 13.4 },
    { type: 'way', id: 10, nodes: [1, 2, 3, 4], tags: { building: 'yes' } },
  ]
  data.merge(elements)
  return { history, data }
}

const NODES = ['n1', 'n2', 'n3', 'n4'] as const

function locs(history: EditHistory) {
  return NODES.map((id) => (history.staging.graph.entity(id) as OsmNode).loc)
}

describe('actionMoveNodes', () => {
  const moves: [id: string, to: [number, number]][] = [
    ['n1', [13.4102, 52.5011]],
    ['n2', [13.4087, 52.5023]],
    ['n3', [13.4113, 52.5098]],
    ['n4', [13.4001, 52.5101]],
  ]

  test('gives the locations that one actionMoveNode per node gives', () => {
    const { history } = building()
    const base = new Graph(history.staging.graph)
    const perNode = moves.reduce((graph, [id, to]) => actionMoveNode(id, to)(graph), base)
    const onePass = actionMoveNodes(moves)(new Graph(history.staging.graph))
    for (const id of NODES) {
      expect((onePass.entity(id) as OsmNode).loc).toEqual((perNode.entity(id) as OsmNode).loc)
    }
  })

  test('is one undo step: undo takes every node back', () => {
    const { history } = building()
    const before = locs(history)
    history.perform(actionMoveNodes(moves))
    history.commit({ annotation: 'Rotated a feature' })
    expect(locs(history)).not.toEqual(before)
    expect(history.getUndoAnnotation()).toBe('Rotated a feature')
    history.undo()
    expect(locs(history)).toEqual(before)
    expect(history.getUndoAnnotation()).toBeUndefined()
  })
})

describe('TransformTool steps', () => {
  // the animation frames the tool asks for, run by the test
  let frames = new Map<number, FrameRequestCallback>()
  let nextFrame = 1
  const original = {
    request: globalThis.requestAnimationFrame,
    cancel: globalThis.cancelAnimationFrame,
  }
  beforeEach(() => {
    frames = new Map()
    nextFrame = 1
    Object.assign(globalThis, {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(nextFrame, callback)
        return nextFrame++
      },
      cancelAnimationFrame: (id: number) => {
        frames.delete(id)
      },
    })
  })
  afterEach(() => {
    Object.assign(globalThis, {
      requestAnimationFrame: original.request,
      cancelAnimationFrame: original.cancel,
    })
  })
  const runFrames = () => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(0)
  }

  /** A tool on a building, and the number of steps (engine changes) it has made */
  function tool() {
    const { history, data } = building()
    let steps = 0
    const engine = {
      data,
      isReadOnly: () => false,
      change: (step: () => void) => {
        steps++
        step()
      },
    } as unknown as MaidEngine
    return { history, steps: () => steps, transform: new TransformTool(engine) }
  }

  // pointer positions around the middle of the building, the first one is where the pointer starts
  const pointers: [number, number][] = [
    [13.43, 52.505],
    [13.44, 52.507],
    [13.45, 52.503],
    [13.42, 52.51],
    [13.4, 52.5],
    [13.415, 52.496],
  ]

  test('a rotation makes one step per frame, with the latest pointer position', () => {
    const many = tool()
    many.transform.begin('rotate', ['w10'])
    for (const [lon, lat] of pointers) many.transform.move(lon, lat)
    expect(many.steps()).toBe(0)
    runFrames()
    expect(many.steps()).toBe(1)

    // the same position, reached by one move and one frame
    const direct = tool()
    direct.transform.begin('rotate', ['w10'])
    direct.transform.move(...pointers[0]!)
    runFrames()
    direct.transform.move(...pointers[pointers.length - 1]!)
    runFrames()
    expect(locs(many.history)).toEqual(locs(direct.history))
    expect(locs(many.history)).not.toEqual(locs(tool().history))
  })

  test('a move makes one step per frame, with the latest pointer position', () => {
    const many = tool()
    many.transform.begin('move', ['w10'])
    for (const [lon, lat] of pointers) many.transform.move(lon, lat)
    runFrames()
    expect(many.steps()).toBe(1)

    const direct = tool()
    direct.transform.begin('move', ['w10'])
    direct.transform.move(...pointers[0]!)
    runFrames()
    direct.transform.move(...pointers[pointers.length - 1]!)
    runFrames()
    expect(locs(many.history)).toEqual(locs(direct.history))
  })

  test('finish applies the pending position first and keeps one undo step', () => {
    const pending = tool()
    pending.transform.begin('rotate', ['w10'])
    pending.transform.move(...pointers[0]!)
    runFrames()
    for (const [lon, lat] of pointers.slice(1)) pending.transform.move(lon, lat)
    // no frame has run for the last positions: the click or the mode change ends the move
    expect(pending.transform.finish()).toBe(true)
    expect(pending.history.getUndoAnnotation()).toBe('Rotated a feature')

    const direct = tool()
    direct.transform.begin('rotate', ['w10'])
    direct.transform.move(...pointers[0]!)
    runFrames()
    direct.transform.move(...pointers[pointers.length - 1]!)
    direct.transform.finish()
    expect(locs(pending.history)).toEqual(locs(direct.history))
    // the one undo step takes every node back
    const original = locs(tool().history)
    pending.history.undo()
    expect(locs(pending.history)).toEqual(original)
  })

  test('cancel puts everything back and drops the position that waits for a frame', () => {
    const cancelled = tool()
    const before = locs(cancelled.history)
    cancelled.transform.begin('rotate', ['w10'])
    cancelled.transform.move(...pointers[0]!)
    runFrames()
    for (const [lon, lat] of pointers.slice(1)) cancelled.transform.move(lon, lat)
    const steps = cancelled.steps()
    cancelled.transform.cancel()
    runFrames()
    expect(cancelled.steps()).toBe(steps + 1) // the cancel's own revert, and no move after it
    expect(locs(cancelled.history)).toEqual(before)
    expect(cancelled.history.hasWorkInProgress).toBe(false)
    expect(cancelled.transform.active).toBe(false)
  })
})
