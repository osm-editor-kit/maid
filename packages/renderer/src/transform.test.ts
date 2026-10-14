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
import { defaultPresets } from '@osm-editor-kit/maid-presets/default'
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

/** A building of four nodes, in the history, as the editor has it. Node 1 may carry tags, as a vertex with a direction. */
function building(node1Tags?: Record<string, string>) {
  const context = new ModelContext()
  const history = new EditHistory(context)
  const data = new OsmData(context, history)
  const elements: OsmJsonElement[] = [
    { type: 'node', id: 1, lat: 52.5, lon: 13.4, tags: node1Tags },
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
    return toolFor(building())
  }

  /**
   * A tool on the data of a history, and the number of steps (engine changes) it has made. The presets
   * are the editor's: without them (`presetsPending`) a point with no direction tag does not turn.
   */
  function toolFor(
    { history, data }: { history: EditHistory; data: OsmData },
    presets?: typeof defaultPresets,
  ) {
    let steps = 0
    const engine = {
      data,
      options: { editor: { presets } },
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

  // R on one point with a direction tag turns that tag (iD's rotate-point-direction). The point is at
  // (13.4, 52.5). On the Mercator plane, north, east and south of it are the bearings 0, 90 and 180.
  const POINT = [13.4, 52.5] as const
  const NORTH: [number, number] = [POINT[0], POINT[1] + 0.005]
  const EAST: [number, number] = [POINT[0] + 0.005, POINT[1]]
  const SOUTH: [number, number] = [POINT[0], POINT[1] - 0.005]
  const WEST: [number, number] = [POINT[0] - 0.005, POINT[1]]

  /** A history with one point that has these tags, and a tool on it (with the presets, when given) */
  function pointTool(tags: Record<string, string>, presets?: typeof defaultPresets) {
    const context = new ModelContext()
    const history = new EditHistory(context)
    const data = new OsmData(context, history)
    data.merge([{ type: 'node', id: 7, lat: POINT[1], lon: POINT[0], tags }])
    return toolFor({ history, data }, presets)
  }
  const tagsOf = (history: EditHistory) => (history.staging.graph.entity('n7') as OsmNode).tags

  test('a quarter turn of the pointer turns a numeric direction a quarter turn, as one undo step', () => {
    const point = pointTool({ direction: '0' })
    expect(point.transform.begin('rotate', ['n7'])).toBe(true)
    point.transform.move(...NORTH) // the first position is where the pointer started
    point.transform.move(...EAST)
    runFrames()
    expect(point.transform.finish()).toBe(true)
    expect(tagsOf(point.history).direction).toBe('90')
    expect(point.history.getUndoAnnotation()).toBe('Rotated a point')
    point.history.undo()
    expect(tagsOf(point.history).direction).toBe('0')
  })

  test('a direction is written one step per frame, with the latest pointer position', () => {
    const many = pointTool({ direction: '0' })
    many.transform.begin('rotate', ['n7'])
    many.transform.move(...NORTH)
    runFrames()
    for (const at of [EAST, SOUTH, WEST, EAST]) many.transform.move(...at)
    runFrames()
    expect(many.steps()).toBe(2)
    const direct = pointTool({ direction: '0' })
    direct.transform.begin('rotate', ['n7'])
    direct.transform.move(...NORTH)
    runFrames()
    direct.transform.move(...EAST)
    runFrames()
    expect(tagsOf(many.history).direction).toBe(tagsOf(direct.history).direction)
    expect(tagsOf(many.history).direction).toBe('90')
  })

  test('a view change: the first pointer move after it writes nothing, as iD skips it', () => {
    const point = pointTool({ direction: '0' })
    point.transform.begin('rotate', ['n7'])
    point.transform.move(...NORTH)
    point.transform.move(...EAST)
    runFrames()
    expect(tagsOf(point.history).direction).toBe('90')
    point.transform.viewChanged()
    const steps = point.steps()
    point.transform.move(...SOUTH) // the first move after the view changed: skipped
    runFrames()
    expect(point.steps()).toBe(steps)
    expect(tagsOf(point.history).direction).toBe('90')
    // the next move writes again, at the pointer's absolute bearing: due west is 270
    point.transform.move(...WEST)
    runFrames()
    expect(tagsOf(point.history).direction).toBe('270')
  })

  test('the direction points at the pointer: due east is 90 from wherever the pointer started', () => {
    const fromSouth = pointTool({ direction: '0' })
    fromSouth.transform.begin('rotate', ['n7'])
    fromSouth.transform.move(...SOUTH)
    fromSouth.transform.move(...EAST)
    fromSouth.transform.finish()
    expect(tagsOf(fromSouth.history).direction).toBe('90')
  })

  test('a multi-value direction: the first angle follows the pointer, the others keep their offset', () => {
    const two = pointTool({ direction: '120;300' })
    two.transform.begin('rotate', ['n7'])
    two.transform.move(...NORTH)
    two.transform.move(...EAST)
    two.transform.finish()
    expect(tagsOf(two.history).direction).toBe('90;270')

    const cardinal = pointTool({ direction: 'N' })
    cardinal.transform.begin('rotate', ['n7'])
    cardinal.transform.move(...NORTH)
    cardinal.transform.move(...EAST)
    cardinal.transform.finish()
    expect(tagsOf(cardinal.history).direction).toBe('90')
  })

  test('a prefixed direction is the one that turns; the plain direction stays', () => {
    const point = pointTool({ 'camera:direction': '10', direction: '200' })
    point.transform.begin('rotate', ['n7'])
    point.transform.move(...NORTH)
    point.transform.move(...EAST)
    point.transform.finish()
    expect(tagsOf(point.history)['camera:direction']).toBe('90')
    expect(tagsOf(point.history).direction).toBe('200')
  })

  test('a point with no direction, or a relative one, does not rotate', () => {
    // a bench has no direction tag, and no presets to say which tag it would get
    expect(pointTool({ amenity: 'bench' }).transform.begin('rotate', ['n7'])).toBe(false)
    expect(
      pointTool({ highway: 'give_way', direction: 'forward' }, defaultPresets).transform.begin(
        'rotate',
        ['n7'],
      ),
    ).toBe(false)
    expect(pointTool({ direction: '90' }).transform.begin('move', ['n7'])).toBe(true)
  })

  test('a bench with no direction tag: R turns the direction field of its preset, from the first pointer move', () => {
    const bench = pointTool({ amenity: 'bench' }, defaultPresets)
    expect(bench.transform.directionOf(['n7'])?.key).toBe('direction')
    expect(bench.transform.begin('rotate', ['n7'])).toBe(true)
    bench.transform.move(...NORTH) // the first position is where the pointer started
    runFrames()
    expect(tagsOf(bench.history).direction).toBe('0')
    bench.transform.move(...EAST)
    runFrames()
    expect(tagsOf(bench.history).direction).toBe('90')
    expect(bench.transform.finish()).toBe(true)
    expect(tagsOf(bench.history).direction).toBe('90')
    expect(bench.history.getUndoAnnotation()).toBe('Rotated a point')
    bench.history.undo()
    expect(tagsOf(bench.history).direction).toBeUndefined()
    expect(tagsOf(bench.history).amenity).toBe('bench')
  })

  test('a bench with no direction tag and no presets (not loaded yet) does not rotate', () => {
    expect(pointTool({ amenity: 'bench' }).transform.directionOf(['n7'])).toBeUndefined()
    expect(pointTool({ amenity: 'bench' }).transform.begin('rotate', ['n7'])).toBe(false)
  })

  test('a point whose preset has no numeric direction field does not rotate', () => {
    expect(pointTool({ amenity: 'cafe' }, defaultPresets).transform.begin('rotate', ['n7'])).toBe(
      false,
    )
  })

  test('a camera with no direction tag gets the direction field of its preset; a relative value stays', () => {
    const camera = pointTool({ man_made: 'surveillance' }, defaultPresets)
    expect(camera.transform.directionOf(['n7'])?.key).toBe('direction')
    // a direction tag with a relative value is not replaced by the preset's numeric field
    const relative = pointTool({ man_made: 'surveillance', direction: 'forward' }, defaultPresets)
    expect(relative.transform.directionOf(['n7'])).toBeUndefined()
  })

  test('Escape on a point that had no direction tag removes the tag again', () => {
    const bench = pointTool({ amenity: 'bench' }, defaultPresets)
    bench.transform.begin('rotate', ['n7'])
    bench.transform.move(...NORTH)
    bench.transform.move(...EAST)
    runFrames()
    expect(tagsOf(bench.history).direction).toBe('90')
    bench.transform.cancel()
    expect(tagsOf(bench.history)).toEqual({ amenity: 'bench' })
    expect(bench.history.hasWorkInProgress).toBe(false)
    expect(bench.transform.active).toBe(false)
  })

  test('a vertex of a way with no direction tag: its preset field turns, the way keeps its shape', () => {
    const { history, data } = building({ amenity: 'bench' })
    const node = toolFor({ history, data }, defaultPresets)
    const before = locs(history)
    expect(node.transform.directionOf(['n1'])?.key).toBe('direction')
    expect(node.transform.begin('rotate', ['n1'])).toBe(true)
    node.transform.move(...NORTH)
    node.transform.move(...EAST)
    node.transform.finish()
    expect((history.staging.graph.entity('n1') as OsmNode).tags.direction).toBe('90')
    expect(node.history.getUndoAnnotation()).toBe('Rotated a node in a way')
    expect(locs(history)).toEqual(before)
  })

  test('a node of a way turns its own direction; the way keeps its shape', () => {
    const { history, data } = building({ direction: '0' })
    const before = locs(history)
    const node = toolFor({ history, data })
    expect(node.transform.directionOf(['n1'])?.key).toBe('direction')
    expect(node.transform.begin('rotate', ['n1'])).toBe(true)
    node.transform.move(...NORTH)
    node.transform.move(...EAST)
    node.transform.finish()
    expect((history.staging.graph.entity('n1') as OsmNode).tags.direction).toBe('90')
    expect(node.history.getUndoAnnotation()).toBe('Rotated a node in a way')
    expect(locs(history)).toEqual(before)
  })

  test('Escape (cancel) puts a direction back, and leaves no work in progress', () => {
    const point = pointTool({ direction: '0' })
    point.transform.begin('rotate', ['n7'])
    point.transform.move(...NORTH)
    point.transform.move(...EAST)
    runFrames()
    expect(tagsOf(point.history).direction).toBe('90')
    point.transform.cancel()
    expect(tagsOf(point.history).direction).toBe('0')
    expect(point.history.hasWorkInProgress).toBe(false)
    expect(point.transform.active).toBe(false)
  })

  test('two selected nodes rotate their geometry, not a direction', () => {
    const { history, data } = building({ direction: '0' })
    const both = toolFor({ history, data })
    expect(both.transform.directionOf(['n1', 'n2'])).toBeUndefined()
    expect(both.transform.begin('rotate', ['n1', 'n2'])).toBe(true)
    expect(both.transform.begin('rotate', ['n1', 'n2'])).toBe(false) // already active
    both.transform.cancel()
  })
})
