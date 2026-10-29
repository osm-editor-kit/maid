import { afterEach, describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { Graph, OsmNode } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { MaidEngine, ModuleMode, ModuleModeInfo } from '@osm-editor-kit/maid-renderer'
import { at, graphOf, node, way } from '../cut/test-graph.ts'
import { m } from '../messages.ts'
import type { Loc } from '../shared/metres.ts'
import { handleAt, type Handle } from './box.ts'
import { applyResize, MODE_ID, startResize } from './mode.ts'
import { resizeOperation } from './operation.ts'
import { resizeActions, resizeSnapshot } from './resize-store.ts'
import { locOf, movesFor } from './resize.ts'
import { handleName, HANDLE_HIT_LAYERS, previewShapes } from './shapes.ts'

const NONE = { shift: false, alt: false, ctrl: false, meta: false }
const SHIFT = { ...NONE, shift: true }
const ALT = { ...NONE, alt: true }

/** The pointer at a place on the screen: what the engine passes to a mode's click, without a snap */
const info: ModuleModeInfo = { point: { x: 0, y: 0 }, modifiers: NONE }

/**
 * A fake editor and engine around one graph. The history keeps the stable graph and the work in progress apart, as the
 * real one does: `revert` goes back to the stable graph, `commit` makes the work in progress stable. The engine keeps the
 * mode it started (entering a mode ends the one under way) and the selection, and tells its listeners after a change.
 * No map, no shell.
 */
function harness(base: Graph) {
  // the history works on a graph over the base graph, as the real one does: a base graph cannot be changed
  const graph = new Graph(base)
  const state = {
    stable: graph,
    graph,
    commits: [] as { annotation: string; selectedIDs: string[] }[],
    mode: undefined as ModuleMode | undefined,
    selection: [] as string[],
    listeners: new Set<() => void>(),
  }
  const changed = () => {
    for (const listener of state.listeners) listener()
  }
  const editor = {
    history: {
      get staging() {
        return { graph: state.graph }
      },
      get hasWorkInProgress() {
        return state.graph !== state.stable
      },
      perform(...actions: ((g: Graph) => Graph)[]) {
        // each action works on a copy, so the stable graph is never changed in place
        state.graph = actions.reduce((g, action) => action(new Graph(g)), state.graph)
      },
      revert() {
        state.graph = state.stable
      },
      commit(entry: { annotation: string; selectedIDs: string[] }) {
        state.stable = state.graph
        state.commits.push(entry)
      },
    },
  } as unknown as Editor
  const engine = {
    get moduleMode() {
      return state.mode
    },
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
    get selection() {
      return state.selection
    },
    setSelected(ids: string[]) {
      state.selection = ids
      changed()
    },
    subscribe(listener: () => void) {
      state.listeners.add(listener)
      return () => state.listeners.delete(listener)
    },
    change(step: () => void) {
      step()
      changed()
    },
  } as unknown as MaidEngine
  const host = { editor, engine } as OperationHost
  return { state, host, engine, editor }
}

/** A building 40 m by 20 m (w1, nodes n1 to n4) and a footway from its corner n2 to x1 */
function buildingGraph() {
  return graphOf(
    node('n1', 0, 0),
    node('n2', 40, 0),
    node('n3', 40, 20),
    node('n4', 0, 20),
    node('x1', 80, 0),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
    way('w2', ['n2', 'x1'], { highway: 'footway' }),
  )
}

function begin(graph = buildingGraph(), ids = ['w1']) {
  const h = harness(graph)
  h.state.selection = ids
  startResize(h.host, ids)
  return { ...h, mode: h.state.mode as ModuleMode }
}

/** Where a handle is now, as [lon, lat] */
function handlePlace(handle: Handle) {
  const { box, extent } = resizeSnapshot()
  return locOf(box!, handleAt(extent!, handle))
}

/**
 * A drag of a handle to the metre place (x, y), with these keys. It is grabbed where it is, or at `from` (metres) when
 * given: the handle keeps the offset from the pointer where it was grabbed.
 */
function drag(
  mode: ModuleMode,
  handle: Handle,
  x: number,
  y: number,
  modifiers = NONE,
  from?: { x: number; y: number },
) {
  const [lon0, lat0] = from ? at(from.x, from.y) : handlePlace(handle)
  const [lon, lat] = at(x, y)
  mode.onDragStart?.(handleName(handle), lon0, lat0, { modifiers })
  mode.onDrag?.(handleName(handle), lon, lat, { modifiers })
  mode.onDragEnd?.(handleName(handle), lon, lat, { modifiers })
}

/** A position in metres from the test origin */
function metres(loc: Loc) {
  const [x0, y0] = at(0, 0)
  const [x1, y1] = at(1, 1)
  return { x: (loc[0] - x0) / (x1 - x0), y: (loc[1] - y0) / (y1 - y0) }
}

function expectNear(loc: Loc, x: number, y: number) {
  const p = metres(loc)
  expect(p.x).toBeCloseTo(x, 2)
  expect(p.y).toBeCloseTo(y, 2)
}

/** A node in the data */
function expectAt(graph: Graph, id: string, x: number, y: number) {
  expectNear((graph.entity(id) as OsmNode).loc!, x, y)
}

/** A node of the box where the preview draws it now */
function expectDrawn(id: string, x: number, y: number) {
  const { box, extent } = resizeSnapshot()
  expectNear(new Map(movesFor(box!, extent!)).get(id)!, x, y)
}

afterEach(() => resizeActions().end())

describe('starting a resize', () => {
  it('enters the mode with its handle layer and shows the box around the building', () => {
    const { mode } = begin()
    expect(mode.id).toBe(MODE_ID)
    expect(mode.handleLayers).toEqual([...HANDLE_HIT_LAYERS])
    expect(mode.endsOnUndo).toBe(true)
    const { extent, ids } = resizeSnapshot()
    expect(ids).toEqual(['w1'])
    expect(extent!.maxU - extent!.minU).toBeCloseTo(40, 2)
    expect(extent!.maxV - extent!.minV).toBeCloseTo(20, 2)
  })

  it('does not start on work in progress that the mode did not finish, or on a straight line', () => {
    const h = harness(buildingGraph())
    h.host.editor.history.perform((g: Graph) =>
      new Graph(g).replace((g.entity('n1') as OsmNode).move(at(1, 1))),
    )
    startResize(h.host, ['w1'])
    expect(h.state.mode).toBeUndefined()
    expect(resizeSnapshot().box).toBeUndefined()
    const line = harness(graphOf(node('a', 0, 0), node('b', 30, 0), way('w9', ['a', 'b'])))
    startResize(line.host, ['w9'])
    expect(line.state.mode).toBeUndefined()
  })

  it('takes the box from the data after entering, which finishes a running move first', () => {
    const h = harness(buildingGraph())
    // a running Move: the engine finishes it (a commit) when a module mode is entered
    h.host.editor.history.perform((g: Graph) =>
      new Graph(g).replace((g.entity('n3') as OsmNode).move(at(40, 30))),
    )
    const enter = h.engine.enterModuleMode.bind(h.engine)
    h.engine.enterModuleMode = (mode: ModuleMode) => {
      h.host.editor.history.commit({ annotation: 'Moved', selectedIDs: ['w1'] })
      enter(mode)
    }
    h.state.selection = ['w1']
    startResize(h.host, ['w1'])
    expect(h.state.mode?.id).toBe(MODE_ID)
    const { extent } = resizeSnapshot().box!
    expect(extent.maxV - extent.minV).toBeGreaterThan(20)
  })
})

describe('dragging a handle', () => {
  it('changes only the preview: the data stays until the resize is kept', () => {
    const { mode, state } = begin()
    const before = state.graph
    drag(mode, 'e', 60, 10)
    expect(state.graph).toBe(before)
    expect(state.graph).toBe(state.stable)
    expectDrawn('n2', 60, 0)
    expect(state.commits).toEqual([])
  })

  it('draws the building and the connected footway: the shared corner moves, the far end stays', () => {
    const { mode } = begin()
    drag(mode, 'e', 60, 10)
    const { box, extent, preview } = resizeSnapshot()
    const features = previewShapes(preview!, new Map(movesFor(box!, extent!)))
    expect(features.map((feature) => feature.properties?.kind)).toEqual([
      'preview-fill',
      'preview-line',
      'preview-line',
    ])
    const footway = features[2]!.geometry as unknown as { coordinates: Loc[] }
    expectNear(footway.coordinates[0]!, 60, 0)
    expectNear(footway.coordinates[1]!, 80, 0)
  })

  it('stretches from the east edge; the far wall stays', () => {
    const { mode } = begin()
    drag(mode, 'e', 60, 10)
    expectDrawn('n1', 0, 0)
    expectDrawn('n2', 60, 0)
    expectDrawn('n3', 60, 20)
  })

  it('keeps the proportions with Shift and the centre with Alt', () => {
    const shifted = begin()
    drag(shifted.mode, 'ne', 80, 40, SHIFT)
    expectDrawn('n3', 80, 40)
    expectDrawn('n1', 0, 0)
    resizeActions().end()

    const centred = begin()
    drag(centred.mode, 'e', 50, 10, ALT)
    expectDrawn('n1', -10, 0)
    expectDrawn('n2', 50, 0)
  })

  it('uses the panel toggles, and a held key turns its toggle round', () => {
    const { mode } = begin()
    resizeActions().toggleProportional()
    drag(mode, 'ne', 80, 40)
    expectDrawn('n3', 80, 40)
    // Shift with the toggle on stretches freely
    drag(mode, 'ne', 100, 40, SHIFT)
    expectDrawn('n3', 100, 40)
  })

  it('keeps the offset where the handle was grabbed: a press beside it does not make the box jump', () => {
    const { mode } = begin()
    // the east edge's handle is at (40, 10); grabbed 3 m east of it and let go there, nothing changes
    drag(mode, 'e', 43, 10, NONE, { x: 43, y: 10 })
    expectDrawn('n2', 40, 0)
    // grabbed there and moved 10 m east, the edge moves 10 m
    drag(mode, 'e', 53, 10, NONE, { x: 43, y: 10 })
    expectDrawn('n2', 50, 0)
  })

  it('takes the handle nearest the press, whichever one the map reported', () => {
    const { mode } = begin()
    // the map named the north-east corner, but the press was at the east edge's handle
    const [lon0, lat0] = at(40, 10)
    const [lon, lat] = at(60, 10)
    mode.onDragStart?.(handleName('ne'), lon0, lat0, { modifiers: NONE })
    mode.onDragEnd?.(handleName('ne'), lon, lat, { modifiers: NONE })
    expectDrawn('n2', 60, 0)
    expectDrawn('n3', 60, 20)
  })

  it('continues each drag from the box the last one left', () => {
    const { mode } = begin()
    drag(mode, 'e', 60, 10)
    drag(mode, 'n', 30, 30)
    expectDrawn('n3', 60, 30)
    expectDrawn('n1', 0, 0)
  })
})

describe('ending a resize', () => {
  it('keeps the result as one undo step on Enter, with the building still selected', () => {
    const { mode, state } = begin()
    drag(mode, 'e', 60, 10)
    drag(mode, 'n', 30, 30)
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.commits).toEqual([{ annotation: m.resize_annotation_one(), selectedIDs: ['w1'] }])
    expect(state.mode).toBeUndefined()
    expectAt(state.stable, 'n3', 60, 30)
    // the shared corner moved with the building, the footway's other end did not
    expectAt(state.stable, 'n2', 60, 0)
    expectAt(state.stable, 'x1', 80, 0)
    expect(resizeSnapshot().box).toBeUndefined()
  })

  it('applies on a click outside the box, not inside it', () => {
    const { mode, state } = begin()
    drag(mode, 'e', 60, 10)
    const [lon, lat] = at(30, 10)
    mode.onClick?.(lon, lat, info)
    expect(state.commits).toEqual([])
    const [outLon, outLat] = at(30, 50)
    mode.onClick?.(outLon, outLat, info)
    expect(state.commits).toHaveLength(1)
  })

  it('changes nothing on Escape', () => {
    const { mode, state, engine } = begin()
    const before = state.graph
    drag(mode, 'e', 60, 10)
    engine.exitModuleMode()
    expect(state.commits).toEqual([])
    expect(state.graph).toBe(before)
    expect(resizeSnapshot().box).toBeUndefined()
  })

  it('makes no step when the box did not change', () => {
    const { state, host } = begin()
    applyResize(host)
    expect(state.commits).toEqual([])
    expect(state.mode).toBeUndefined()
  })

  it('ends when another feature is selected, or the selection is cleared', () => {
    const { engine, state } = begin()
    engine.setSelected(['w2'])
    expect(state.mode).toBeUndefined()
    expect(resizeSnapshot().box).toBeUndefined()
    const again = begin()
    again.engine.setSelected([])
    expect(again.state.mode).toBeUndefined()
  })

  it('ends when a node of the box changes outside the mode, and stays on an edit of something else', () => {
    const { engine, editor, state } = begin()
    // a tag on the footway leaves the building's nodes as they are: the box still fits
    engine.change(() => {
      editor.history.perform((g: Graph) =>
        new Graph(g).replace(g.entity('w2').update({ tags: { highway: 'path' } })),
      )
      editor.history.commit({ annotation: 'Tag', selectedIDs: ['w2'] })
    })
    expect(state.mode?.id).toBe(MODE_ID)
    // a corner moved by something else (an undo, new data): the box no longer fits
    engine.change(() => {
      editor.history.perform((g: Graph) =>
        new Graph(g).replace((g.entity('n3') as OsmNode).move(at(41, 21))),
      )
      editor.history.commit({ annotation: 'Moved', selectedIDs: ['n3'] })
    })
    expect(state.mode).toBeUndefined()
    expect(state.listeners.size).toBe(0)
  })

  it('names a group by its count', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 40, 0),
      node('n3', 40, 20),
      node('n4', 0, 20),
      node('p1', 20, 30),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { building: 'yes' }),
    )
    const { mode, state } = begin(graph, ['w1', 'p1'])
    expect(resizeSnapshot().preview!.points).toEqual(['p1'])
    drag(mode, 'n', 20, 60)
    mode.onKey?.('Enter')
    expect(state.commits[0]?.annotation).toBe(m.resize_annotation({ count: 2 }))
    // the point moved with the box: it was on the top side and stays there
    expectAt(state.stable, 'p1', 20, 60)
  })
})

describe('the operation', () => {
  it('has the key K, lists Shift and Alt in its tooltip, and says why a line cannot be resized', () => {
    expect(resizeOperation.shortcut).toBe('k')
    expect(resizeOperation.hints?.().map((hint) => hint.keys)).toEqual(['Shift', 'Alt'])
    const line = graphOf(node('a', 0, 0), node('b', 30, 0), way('w9', ['a', 'b']))
    const context = { graph: line, selected: ['w9'] }
    expect(resizeOperation.applies(context)).toBe(true)
    expect(resizeOperation.disabled(context)).toBe(m.resize_refused_too_thin())
    const building = { graph: buildingGraph(), selected: ['w1'] }
    expect(resizeOperation.disabled(building)).toBeUndefined()
  })
})
