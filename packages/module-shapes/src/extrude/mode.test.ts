import { describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { Graph, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OperationHost } from '@osm-editor-kit/maid-operations'
import type { MaidEngine, ModuleMode, ModuleModeInfo } from '@osm-editor-kit/maid-renderer'
import { at, graphOf, node, way } from '../cut/test-graph.ts'
import { toLoc, toMetres } from '../shared/metres.ts'
import { extrudeActions, extrudeSnapshot } from './extrude-store.ts'
import type { Side } from './extrude.ts'
import { MODE_ID, startExtrude } from './mode.ts'
import { extrudeOperation } from './operation.ts'
import { handleName } from './shapes.ts'

const NONE = { shift: false, alt: false, ctrl: false, meta: false }
const SHIFT = { ...NONE, shift: true }

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

/** A parking lot 40 m by 20 m (w1, n1 to n4, anticlockwise) and a footway from its corner n2 to x1 */
function lotGraph() {
  return graphOf(
    node('n1', 0, 0),
    node('n2', 40, 0),
    node('n3', 40, 20),
    node('n4', 0, 20),
    node('x1', 80, 0),
    way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { amenity: 'parking' }),
    way('w2', ['n2', 'x1'], { highway: 'footway' }),
  )
}

function begin(graph = lotGraph()) {
  const h = harness(graph)
  h.state.selection = ['w1']
  startExtrude(h.host, 'w1')
  return { ...h, mode: h.state.mode as ModuleMode }
}

function sideOf(a: string, b: string): Side {
  const side = extrudeSnapshot().sides.find((s) => s.a === a && s.b === b)
  if (!side) throw new Error(`no side ${a}-${b}`)
  return side
}

/** The place of a node in metres from n1, rounded to millimetres */
function placeOf(graph: Graph, id: string) {
  const frame = extrudeSnapshot().way?.frame
  const p = toMetres(frame!, (graph.entity(id) as OsmNode).loc!)
  const o = toMetres(frame!, at(0, 0))
  return { x: Math.round((p.x - o.x) * 1000) / 1000, y: Math.round((p.y - o.y) * 1000) / 1000 }
}

/** A drag of a side's handle by (dx, dy) metres, with these keys */
function pull(mode: ModuleMode, side: Side, dx: number, dy: number, modifiers = NONE) {
  const frame = extrudeSnapshot().way!.frame
  const from = toLoc(frame, side.middle)
  const to = toLoc(frame, { x: side.middle.x + dx, y: side.middle.y + dy })
  mode.onDragStart?.(handleName(side), from[0], from[1], { modifiers })
  mode.onDrag?.(handleName(side), to[0], to[1], { modifiers })
  return () => mode.onDragEnd?.(handleName(side), to[0], to[1], { modifiers })
}

const click = (target?: ModuleModeInfo['target']): ModuleModeInfo => ({
  point: { x: 0, y: 0 },
  modifiers: NONE,
  target,
})

describe('the extrude operation', () => {
  it('applies to one way and starts the mode', () => {
    const h = harness(lotGraph())
    h.state.selection = ['w1']
    const context = { graph: h.state.graph, selected: ['w1'] } as never
    expect(extrudeOperation.applies(context)).toBe(true)
    expect(extrudeOperation.applies({ graph: h.state.graph, selected: ['n1'] } as never)).toBe(
      false,
    )
    extrudeOperation.start?.(context, h.host)
    expect(h.state.mode?.id).toBe(MODE_ID)
    expect(extrudeSnapshot().sides.length).toBe(4)
    h.engine.exitModuleMode()
  })
})

describe('the extrude mode', () => {
  it('shows the pull while dragging and changes nothing until it ends', () => {
    const { state, mode, engine } = begin()
    const end = pull(mode, sideOf('n2', 'n3'), 6, 0)
    expect(extrudeSnapshot().pull?.distance).toBeCloseTo(6, 6)
    expect(state.commits.length).toBe(0)
    expect(state.graph).toBe(state.stable)
    end()
    expect(state.commits.length).toBe(1)
    expect(placeOf(state.graph, 'n2')).toEqual({ x: 46, y: 0 })
    expect(placeOf(state.graph, 'n3')).toEqual({ x: 46, y: 20 })
    // a rectangle stays a rectangle: no new corner
    expect((state.graph.entity('w1') as OsmWay).nodes.length).toBe(5)
    // the mode stays on, its handles on the way as it is now
    expect(state.mode?.id).toBe(MODE_ID)
    expect(sideOf('n2', 'n3').middle.x).toBeCloseTo(sideOf('n4', 'n1').middle.x + 46, 3)
    engine.exitModuleMode()
  })

  it('uses only the part of the drag at a right angle to the side', () => {
    const { state, mode, engine } = begin()
    pull(mode, sideOf('n2', 'n3'), 3, 50)()
    expect(placeOf(state.graph, 'n2')).toEqual({ x: 43, y: 0 })
    engine.exitModuleMode()
  })

  it('moves the corner shared with the footway with it', () => {
    const { state, mode, engine } = begin()
    pull(mode, sideOf('n2', 'n3'), 6, 0)()
    expect((state.graph.entity('w2') as OsmWay).nodes).toEqual(['n2', 'x1'])
    expect(placeOf(state.graph, 'n2')).toEqual({ x: 46, y: 0 })
    engine.exitModuleMode()
  })

  it('makes a bump from a part of a side after two clicks on the outline', () => {
    const { state, mode, engine } = begin()
    // the bottom side n1-n2 runs along y = 0
    const add = (x: number) =>
      mode.onClick?.(
        0,
        0,
        click({ type: 'way', wayId: 'w1', loc: at(x, 0), edge: ['n1', 'n2'], distance: 0 }),
      )
    add(10)
    const first = (state.graph.entity('w1') as OsmWay).nodes[1]!
    mode.onClick?.(
      0,
      0,
      click({ type: 'way', wayId: 'w1', loc: at(20, 0), edge: [first, 'n2'], distance: 0 }),
    )
    expect(state.commits.length).toBe(2)
    const nodes = (state.graph.entity('w1') as OsmWay).nodes
    expect(nodes.length).toBe(7)
    const second = nodes[2]!
    pull(mode, sideOf(first, second), 0, -5)()
    const after = (state.graph.entity('w1') as OsmWay).nodes
    expect(after.length).toBe(9)
    expect(placeOf(state.graph, after[2]!)).toEqual({ x: 10, y: -5 })
    expect(placeOf(state.graph, after[3]!)).toEqual({ x: 20, y: -5 })
    expect(placeOf(state.graph, first)).toEqual({ x: 10, y: 0 })
    expect(state.commits.length).toBe(3)
    engine.exitModuleMode()
  })

  it('moves the side without new corners with Shift, or with the toggle', () => {
    const graph = graphOf(
      node('n1', 0, 0),
      node('n2', 40, 0),
      node('n3', 30, 10),
      node('n4', 10, 10),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n1'], { amenity: 'parking' }),
    )
    for (const how of ['shift', 'toggle'] as const) {
      const { state, mode, engine } = begin(graph)
      if (how === 'toggle') extrudeActions().toggleMoveSide()
      pull(mode, sideOf('n3', 'n4'), 0, 10, how === 'shift' ? SHIFT : NONE)()
      expect((state.graph.entity('w1') as OsmWay).nodes.length).toBe(5)
      expect(placeOf(state.graph, 'n3')).toEqual({ x: 20, y: 20 })
      engine.exitModuleMode()
    }
  })

  it('keeps nothing for a press without a drag', () => {
    const { state, mode, engine } = begin()
    pull(mode, sideOf('n2', 'n3'), 0, 0)()
    expect(state.commits.length).toBe(0)
    engine.exitModuleMode()
  })

  it('ends on a click away from the way, Enter, or another selection', () => {
    const away = begin()
    away.mode.onClick?.(0, 0, click())
    expect(away.state.mode).toBeUndefined()
    expect(extrudeSnapshot().way).toBeUndefined()

    const enter = begin()
    expect(enter.mode.onKey?.('Enter')).toBe(true)
    expect(enter.state.mode).toBeUndefined()

    const other = begin()
    ;(other.engine as unknown as { setSelected: (ids: string[]) => void }).setSelected(['w2'])
    expect(other.state.mode).toBeUndefined()
  })

  it('stays on for a click on a corner of the way', () => {
    const { state, mode, engine } = begin()
    mode.onClick?.(0, 0, click({ type: 'node', id: 'n2', loc: at(40, 0) }))
    expect(state.mode?.id).toBe(MODE_ID)
    expect(state.commits.length).toBe(0)
    engine.exitModuleMode()
  })

  it('follows an undo: the handles go back with the way', () => {
    const { state, mode, engine } = begin()
    const before = state.graph
    pull(mode, sideOf('n2', 'n3'), 6, 0)()
    // an undo as the history does it: back to the graph before, then the engine tells its listeners
    state.graph = before
    state.stable = before
    engine.change(() => {})
    expect(state.mode?.id).toBe(MODE_ID)
    expect(sideOf('n2', 'n3').middle.x - sideOf('n4', 'n1').middle.x).toBeCloseTo(40, 3)
    engine.exitModuleMode()
  })
})
