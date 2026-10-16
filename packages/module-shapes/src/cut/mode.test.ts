import { afterEach, describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { Graph, OsmWay } from '@osm-editor-kit/maid-model'
import type { MaidEngine, ModuleMode, ModuleModeInfo } from '@osm-editor-kit/maid-renderer'
import { m } from '../messages.ts'
import { bindCut, MODE_ID, startCut } from './mode.ts'
import { cutActions, cutStore } from './store.ts'
import { at, graphOf, square } from './test-graph.ts'

/** The pointer at a place on the screen, without a snap: what the engine passes to a mode's callbacks */
const info: ModuleModeInfo = {
  point: { x: 0, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: false, meta: false },
}

/**
 * A fake editor and engine around one graph: the history performs the actions in order, the engine keeps the mode it
 * started and records what the mode asks of it. No map, no shell.
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
      state.mode = mode
    },
    exitModuleMode(id?: string) {
      const mode = state.mode
      if (!mode || (id !== undefined && mode.id !== id)) return
      state.mode = undefined
      mode.onExit?.()
    },
    announceDrawn(ids: readonly string[]) {
      state.announced.push([...ids])
    },
  } as unknown as MaidEngine
  return { state, editor, engine }
}

/** Starts the cut of w1 on a harness and returns the mode as the engine has it */
function begin(graph = graphOf(...square())) {
  const h = harness(graph)
  bindCut({ editor: h.editor, engine: h.engine })
  startCut('w1')
  return { ...h, mode: h.state.mode as ModuleMode }
}

/** A click on the metre position (x, y), as the engine calls the mode with it */
function click(mode: ModuleMode, x: number, y: number) {
  const [lon, lat] = at(x, y)
  mode.onClick?.(lon, lat, info)
}

// each test starts with no map and no cut under way
afterEach(() => {
  bindCut(undefined)
  cutActions.end()
})

describe('cut mode: the line is drawn by clicks', () => {
  it('starts with nothing clicked, and says how to finish, and the way is the one cut', () => {
    begin()
    expect(cutStore.getState().wayId).toBe('w1')
    expect(cutStore.getState().points).toEqual([])
    expect(cutStore.getState().refusal).toBeUndefined()
  })

  it('does not start without a bound map: an operation asked then does nothing', () => {
    expect(() => startCut('w1')).not.toThrow()
    expect(cutStore.getState().wayId).toBeUndefined()
  })

  it('takes a click at the place of the node it snaps to', () => {
    const { mode } = begin()
    const [lon, lat] = at(10, 5)
    const snapped = { type: 'node' as const, id: 'n1', loc: [lon, lat] as [number, number] }
    mode.onClick?.(13.4, 52.5, { ...info, target: snapped })
    expect(cutStore.getState().points).toEqual([[lon, lat]])
  })

  it('a move only moves the pointer: the rubber band, not a point', () => {
    const { mode } = begin()
    const [lon, lat] = at(3, 3)
    mode.onMove?.(lon, lat, info)
    expect(cutStore.getState().pointer).toEqual([lon, lat])
    expect(cutStore.getState().points).toEqual([])
  })

  it('shows no reason for one point, and the chord for a line that crosses twice', () => {
    const { mode } = begin()
    click(mode, -5, 5)
    expect(cutStore.getState().refusal).toBeUndefined()
    click(mode, 15, 5)
    expect(cutStore.getState().refusal).toBeUndefined()
    expect(cutStore.getState().chord?.length).toBe(2)
  })

  it('shows why a line that crosses once is refused, as the mode goes on', () => {
    const { mode } = begin()
    click(mode, -5, 5)
    click(mode, 5, 5)
    expect(cutStore.getState().refusal).toBe('crossings')
    expect(cutStore.getState().chord).toBeUndefined()
  })
})

describe('cut mode: Enter, Backspace and Escape', () => {
  it('Enter cuts along the points as one undo step, selects both pieces and ends the mode', () => {
    const { mode, state } = begin()
    click(mode, -5, 5)
    click(mode, 15, 5)
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.commits).toHaveLength(1)
    expect(state.commits[0]?.annotation).toBe(m.cut_annotation())
    const pieces = state.commits[0]!.selectedIDs
    expect(pieces).toHaveLength(2)
    expect(pieces).toContain('w1')
    expect(state.announced).toEqual([pieces])
    expect(state.mode).toBeUndefined()
    expect(cutStore.getState().wayId).toBeUndefined()
    // both pieces are closed ways with the tags of the square
    for (const id of pieces) {
      const piece = state.graph.entity(id) as OsmWay
      expect(piece.nodes[0]).toBe(piece.nodes[piece.nodes.length - 1])
      expect(piece.tags).toEqual({ building: 'yes' })
    }
  })

  it('Enter on a line that cannot be cut keeps the mode and says why; nothing is written', () => {
    const { mode, state } = begin()
    const before = state.graph
    click(mode, -5, 5)
    click(mode, 5, 5)
    expect(mode.onKey?.('Enter')).toBe(true)
    expect(state.mode).toBe(mode)
    expect(state.commits).toHaveLength(0)
    expect(state.graph).toBe(before)
    expect(cutStore.getState().refusal).toBe('crossings')
  })

  it('Backspace removes the last point, and is taken even with no point to remove', () => {
    const { mode } = begin()
    expect(mode.onKey?.('Backspace')).toBe(true)
    click(mode, -5, 5)
    click(mode, 15, 5)
    expect(mode.onKey?.('Backspace')).toBe(true)
    expect(cutStore.getState().points).toHaveLength(1)
    expect(cutStore.getState().chord).toBeUndefined()
  })

  it('Escape ends the mode with nothing changed: the engine calls onExit, which clears the cut', () => {
    const { mode, state, engine } = begin()
    click(mode, -5, 5)
    click(mode, 15, 5)
    engine.exitModuleMode(MODE_ID)
    expect(state.commits).toHaveLength(0)
    expect(state.announced).toHaveLength(0)
    expect(cutStore.getState().wayId).toBeUndefined()
    expect(cutStore.getState().points).toEqual([])
  })
})
