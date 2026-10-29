import { afterEach, describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { MaidEngine, ModuleMode, ModuleModeInfo } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { cutActions, cutSnapshot } from './cut-store.ts'
import type { Loc } from './cut.ts'
import { HANDLE_HIT_LAYERS } from './line.ts'
import { applyCut, MODE_ID, startCut } from './mode.ts'
import { at, graphOf, square } from './test-graph.ts'

/** What the engine tells a drag: no modifier keys */
const DRAG = { modifiers: { shift: false, alt: false, ctrl: false, meta: false } }

/** The pointer at a place on the screen: what the engine passes to a mode's callbacks, without a snap */
const info: ModuleModeInfo = {
  point: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
}

/**
 * A fake editor and engine around one graph: the history performs the actions in order, the engine keeps the mode it
 * started and records what the mode asks of it. As the real engine, entering a mode ends the one under way. No map, no shell.
 */
function harness(graph: Graph) {
  const state = {
    graph,
    commits: [] as { annotation: string; selectedIDs: string[] }[],
    announced: [] as string[][],
    mode: undefined as ModuleMode | undefined,
  }
  const editor = {
    history: {
      get staging() {
        return { graph: state.graph }
      },
      perform(...actions: ((g: Graph) => Graph)[]) {
        state.graph = actions.reduce((g, action) => action(g), state.graph)
      },
      commit(entry: { annotation: string; selectedIDs: string[] }) {
        state.commits.push(entry)
      },
    },
  } as unknown as Editor
  const engine = {
    enterModuleMode(mode: ModuleMode) {
      const previous = state.mode
      state.mode = mode
      previous?.onExit?.()
    },
    exitModuleMode(id?: string) {
      const mode = state.mode
      if (!mode || (id !== undefined && mode.id !== id)) return
      state.mode = undefined
      mode.onExit?.()
    },
    // the step runs as the real engine runs it; the test does not need the redraw
    change(step: () => void) {
      step()
    },
    announceDrawn(ids: readonly string[]) {
      state.announced.push([...ids])
    },
  } as unknown as MaidEngine
  const host = { editor, engine } as OperationHost
  return { state, editor, engine, host }
}

/** Starts the cut of w1 on a harness (a 10 m square) and returns the mode as the engine has it */
function begin(graph = graphOf(...square())) {
  const h = harness(graph)
  startCut(h.host, 'w1')
  return { ...h, mode: h.state.mode as ModuleMode }
}

/** The mode's callbacks take longitude and latitude: this gives the position of a metre point, from the test origin */
const loc = (x: number, y: number) => at(x, y)

/** Two positions are the same place: within a few micrometres */
function expectSamePlace(actual: Loc | undefined, expected: Loc) {
  expect(actual?.[0]).toBeCloseTo(expected[0], 9)
  expect(actual?.[1]).toBeCloseTo(expected[1], 9)
}

/** A click on the metre position (x, y) */
function click(mode: ModuleMode, x: number, y: number) {
  const [lon, lat] = loc(x, y)
  mode.onClick?.(lon, lat, info)
}

/** A press on a handle, a drag to (x, y) and back to that place: what the engine sends for a drag */
function drag(mode: ModuleMode, name: string, from: [number, number], to: [number, number]) {
  const [fLon, fLat] = loc(...from)
  mode.onDragStart?.(name, fLon, fLat, DRAG)
  const [lon, lat] = loc(...to)
  mode.onDrag?.(name, lon, lat, DRAG)
  mode.onDragEnd?.(name, lon, lat, DRAG)
}

// each test starts with no cut under way
afterEach(() => {
  cutActions().end()
})

describe('cut mode: the default line', () => {
  it('starts with the default line: two points through the centre, both outside, and two pieces', () => {
    const { state } = begin()
    expect(cutSnapshot().wayId).toBe('w1')
    const points = cutSnapshot().points!
    expect(points).toHaveLength(2)
    // the square is 10 m: the line runs down x = 5, from y = -3 to y = 13
    expectSamePlace(points[0], loc(5, -3))
    expectSamePlace(points[1], loc(5, 13))
    expect(cutSnapshot().pieces).toHaveLength(2)
    expect(cutSnapshot().refusal).toBeUndefined()
    expect(state.commits).toHaveLength(0)
  })

  it('a second cut replaces the first: the mode is entered before the store begins', () => {
    const h = harness(graphOf(...square()))
    startCut(h.host, 'w1')
    startCut(h.host, 'w1')
    expect(cutSnapshot().wayId).toBe('w1')
    expect(h.state.mode?.id).toBe(MODE_ID)
  })

  it('starts nothing for something that is not a way with an outline', () => {
    const h = harness(graphOf(...square()))
    startCut(h.host, 'n0')
    expect(h.state.mode).toBeUndefined()
    expect(cutSnapshot().wayId).toBeUndefined()
  })
})

describe('cut mode: a click moves the nearer end', () => {
  it('moves the end nearer to the click, and leaves the other end where it is', () => {
    const { mode } = begin()
    click(mode, 5, 20)
    const points = cutSnapshot().points!
    expect(points).toHaveLength(2)
    expectSamePlace(points[0], loc(5, -3))
    expectSamePlace(points[1], loc(5, 20))
  })

  it('moves the start when the click is nearer to it', () => {
    const { mode } = begin()
    click(mode, 6, -10)
    expectSamePlace(cutSnapshot().points![0], loc(6, -10))
  })

  it('a click that leaves the line crossing once is refused, and the refusal is shown', () => {
    const { mode } = begin()
    // the end moved to the middle of the square: the line crosses the top edge once
    click(mode, 5, 4)
    expect(cutSnapshot().refusal).toBe('crossings')
    expect(cutSnapshot().pieces).toBeUndefined()
  })
})

describe('cut mode: a press on a handle takes its hit area', () => {
  it('the mode asks the engine for the handles by their hit layers, not the dots', () => {
    const { mode } = begin()
    expect(mode.handleLayers).toEqual([...HANDLE_HIT_LAYERS])
  })
})

describe('cut mode: a drag moves a point', () => {
  it('a press on a point and a drag moves that point, and the preview follows', () => {
    const { mode } = begin()
    drag(mode, 'point:0', [5, -3], [3, -6])
    const points = cutSnapshot().points!
    expect(points).toHaveLength(2)
    expectSamePlace(points[0], loc(3, -6))
    expect(cutSnapshot().pieces).toHaveLength(2)
  })
})

describe('cut mode: a press on a midpoint adds a point there', () => {
  it('a midpoint press inserts a point at the midpoint, and the drag moves that point', () => {
    const { mode } = begin()
    const [lon, lat] = loc(5, 5)
    mode.onDragStart?.('midpoint:0', lon, lat, DRAG)
    // a third point, where the midpoint was: it is the one dragged
    expect(cutSnapshot().points).toHaveLength(3)
    expectSamePlace(cutSnapshot().points![1], loc(5, 5))
    const [to, toLat] = loc(6, 5)
    mode.onDrag?.('midpoint:0', to, toLat, DRAG)
    mode.onDragEnd?.('midpoint:0', to, toLat, DRAG)
    const points = cutSnapshot().points!
    expect(points).toHaveLength(3)
    expectSamePlace(points[0], loc(5, -3))
    expectSamePlace(points[1], loc(6, 5))
    expectSamePlace(points[2], loc(5, 13))
  })

  it('a bent line cuts the way in two: both pieces share the bend, as the chord has three nodes', () => {
    const { mode, state } = begin()
    drag(mode, 'midpoint:0', [5, 5], [6, 5])
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.commits).toHaveLength(1)
    const pieces = state.commits[0]!.selectedIDs
    expect(pieces).toHaveLength(2)
    const nodesOf = (id: string) => (state.graph.entity(id) as OsmWay).nodes.slice(0, -1)
    const shared = nodesOf(pieces[0]!).filter((id) => nodesOf(pieces[1]!).includes(id))
    // two crossings of the edges, and the bend
    expect(shared).toHaveLength(3)
    const bend = shared.map((id) => (state.graph.entity(id) as OsmNode).loc)
    expect(bend.some((p) => p !== undefined && Math.abs(p[0] - loc(6, 5)[0]) < 1e-9)).toBe(true)
    for (const id of pieces) {
      const piece = state.graph.entity(id) as OsmWay
      expect(piece.nodes[0]).toBe(piece.nodes[piece.nodes.length - 1])
      expect(piece.tags).toEqual({ building: 'yes' })
    }
  })

  it('a point dragged into the area so the line crosses once is refused: nothing is changed', () => {
    const { mode, state } = begin()
    drag(mode, 'midpoint:0', [5, 5], [5, 5])
    drag(mode, 'point:0', [5, -3], [5, 4])
    expect(cutSnapshot().points).toHaveLength(3)
    expect(cutSnapshot().refusal).toBe('crossings')
    const before = state.graph
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.commits).toHaveLength(0)
    expect(state.graph).toBe(before)
    expect(state.mode).toBe(mode)
    expect(cutSnapshot().refusal).toBe('crossings')
  })
})

describe('cut mode: Enter, Backspace, Escape and Apply', () => {
  it('Enter cuts along the points as one undo step, selects both pieces and ends the mode', () => {
    const { mode, state } = begin()
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.commits).toHaveLength(1)
    expect(state.commits[0]?.annotation).toBe(m.cut_annotation())
    const pieces = state.commits[0]!.selectedIDs
    expect(pieces).toHaveLength(2)
    expect(pieces).toContain('w1')
    expect(state.announced).toEqual([pieces])
    expect(state.mode).toBeUndefined()
    expect(cutSnapshot().wayId).toBeUndefined()
    // both pieces are closed ways with the tags of the square
    for (const id of pieces) {
      const piece = state.graph.entity(id) as OsmWay
      expect(piece.nodes[0]).toBe(piece.nodes[piece.nodes.length - 1])
      expect(piece.tags).toEqual({ building: 'yes' })
    }
  })

  it('Apply in the panel cuts the same way as Enter', () => {
    const { host, state } = begin()
    applyCut(host, 'w1')
    expect(state.commits).toHaveLength(1)
    expect(state.commits[0]!.selectedIDs).toHaveLength(2)
    expect(state.mode).toBeUndefined()
  })

  it('applying for another way than the one under way does nothing', () => {
    const { host, state, mode } = begin()
    applyCut(host, 'w2')
    expect(state.commits).toHaveLength(0)
    expect(state.mode).toBe(mode)
  })

  it('Backspace is taken and does nothing: the editor does not delete the way being cut', () => {
    const { mode, state } = begin()
    const before = cutSnapshot().points
    expect(mode.onKey?.('Backspace')).toBe(true)
    expect(cutSnapshot().points).toBe(before)
    expect(state.commits).toHaveLength(0)
    expect(state.mode).toBe(mode)
  })

  it('Escape ends the mode with nothing changed: the engine calls onExit, which clears the cut', () => {
    const { mode, state, engine } = begin()
    click(mode, 5, 20)
    engine.exitModuleMode(MODE_ID)
    expect(state.commits).toHaveLength(0)
    expect(state.announced).toHaveLength(0)
    expect(cutSnapshot().wayId).toBeUndefined()
    expect(cutSnapshot().points).toBeUndefined()
  })
})
