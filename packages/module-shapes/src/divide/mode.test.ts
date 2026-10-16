import { beforeEach, describe, expect, it } from 'bun:test'
import type { Editor } from '@osm-editor-kit/maid-core'
import { Graph, ModelContext, OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { OperationContext } from '@osm-editor-kit/maid-operations'
import type { MaidEngine, ModuleMode } from '@osm-editor-kit/maid-renderer'
import { bindDivideHost, DIVIDE_MODE_ID, startDivide } from './mode.ts'
import { divideActions, divideStore } from './store.ts'

const context = new ModelContext()
const ORIGIN = [13.4, 52.5] as const
const R = 6378137
const DEG = Math.PI / 180
const KX = R * Math.cos(ORIGIN[1] * DEG) * DEG
const KY = R * DEG

function at(x: number, y: number): [number, number] {
  return [ORIGIN[0] + x / KX, ORIGIN[1] + y / KY]
}

/** A closed way `w1` through the corners, on nodes `n1`.. */
function graphOf(corners: [number, number][]): Graph {
  const nodes = corners.map(([x, y], i) => new OsmNode(context, { id: `n${i + 1}`, loc: at(x, y) }))
  const ids = nodes.map((node) => node.id)
  const way = new OsmWay(context, {
    id: 'w1',
    nodes: [...ids, ...ids.slice(0, 1)],
    tags: { building: 'yes' },
  })
  return new Graph(context, [...nodes, way])
}

const RECTANGLE: [number, number][] = [
  [0, 0],
  [40, 0],
  [40, 20],
  [0, 20],
]
const CONCAVE: [number, number][] = [
  [0, 0],
  [40, 0],
  [10, 10],
  [0, 20],
]

type Commit = { annotation: string; selectedIDs?: string[] }

/**
 * A stand-in for the editor's history: performing an action changes the graph, and each commit is recorded. The actions
 * are the real ones of the model, so the parts are real graph entities. An action gets a head copy, as the editor's does.
 */
function fakeEditor(graph: Graph) {
  const state = { graph, commits: [] as Commit[] }
  const editor = {
    history: {
      get staging() {
        return { graph: state.graph }
      },
      perform(...actions: ((head: Graph) => Graph)[]) {
        for (const action of actions) state.graph = action(new Graph(state.graph))
      },
      commit(options: Commit) {
        state.commits.push(options)
      },
    },
  }
  return { editor: editor as unknown as Editor, state }
}

/** A stand-in for the engine: the mode is entered and ended as the engine does it, and the drawn ids are recorded */
function fakeEngine() {
  const state = {
    mode: undefined as ModuleMode | undefined,
    entered: [] as string[],
    exited: [] as string[],
    drawn: [] as string[][],
  }
  const engine = {
    get moduleMode() {
      return state.mode
    },
    enterModuleMode(mode: ModuleMode) {
      state.mode = mode
      state.entered.push(mode.id)
    },
    exitModuleMode(id?: string) {
      if (state.mode === undefined || (id !== undefined && state.mode.id !== id)) return
      const ended = state.mode
      state.mode = undefined
      state.exited.push(ended.id)
      ended.onExit?.()
    },
    announceDrawn(ids: readonly string[]) {
      state.drawn.push([...ids])
    },
  }
  return { engine: engine as unknown as MaidEngine, state }
}

/** The operation's context for the way `w1` */
function contextOf(graph: Graph): OperationContext {
  return { graph, selected: ['w1'] }
}

beforeEach(() => {
  divideActions.stop()
  bindDivideHost(undefined)
})

describe('the divide mode: start', () => {
  it('does nothing until the map content has bound an editor and an engine', () => {
    const { editor } = fakeEditor(graphOf(RECTANGLE))
    const { engine, state } = fakeEngine()
    startDivide(contextOf(graphOf(RECTANGLE)))
    expect(state.entered).toEqual([])
    expect(divideStore.getState().wayId).toBeUndefined()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graphOf(RECTANGLE)))
    expect(state.entered).toEqual([DIVIDE_MODE_ID])
  })

  it('enters the mode on the area, with two columns and one row', () => {
    const graph = graphOf(RECTANGLE)
    const { editor } = fakeEditor(graph)
    const { engine } = fakeEngine()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graph))
    expect(divideStore.getState()).toMatchObject({ wayId: 'w1', columns: 2, rows: 1 })
  })
})

describe('the divide mode: Enter applies the division as one undo step', () => {
  it('makes the parts, commits once and selects them', () => {
    const graph = graphOf(RECTANGLE)
    const { editor, state: edited } = fakeEditor(graph)
    const { engine, state: engineState } = fakeEngine()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graph))
    const mode = engineState.mode!
    expect(mode.onKey?.('Enter')).toBe(true)

    expect(edited.commits.length).toBe(1)
    expect(edited.commits[0]?.annotation).toBe('Divided an area into 2 parts')
    const parts = edited.commits[0]?.selectedIDs ?? []
    expect(parts.length).toBe(2)
    expect(parts).toContain('w1')
    expect(engineState.drawn).toEqual([parts])
    expect(engineState.exited).toEqual([DIVIDE_MODE_ID])
    // the mode ended, so the store is cleared by the exit
    expect(divideStore.getState().wayId).toBeUndefined()
  })

  it('takes Backspace as not its own', () => {
    const graph = graphOf(RECTANGLE)
    const { editor, state: edited } = fakeEditor(graph)
    const { engine, state: engineState } = fakeEngine()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graph))
    expect(engineState.mode?.onKey?.('Backspace')).toBe(false)
    expect(edited.commits).toEqual([])
  })

  it('shows the refusal in the panel and changes nothing', () => {
    const graph = graphOf(CONCAVE)
    const { editor, state: edited } = fakeEditor(graph)
    const { engine, state: engineState } = fakeEngine()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graph))
    expect(engineState.mode?.onKey?.('Enter')).toBe(true)
    expect(divideStore.getState().refusal).toBe('concave')
    expect(edited.commits).toEqual([])
    expect(engineState.exited).toEqual([])
    expect(engineState.drawn).toEqual([])
  })

  it('applies the columns and rows the store holds, not the defaults', () => {
    const graph = graphOf(RECTANGLE)
    const { editor, state: edited } = fakeEditor(graph)
    const { engine, state: engineState } = fakeEngine()
    bindDivideHost({ editor, engine })
    startDivide(contextOf(graph))
    divideActions.set('columns', 4)
    divideActions.step('rows', 1)
    engineState.mode?.onKey?.('Enter')
    expect(edited.commits[0]?.annotation).toBe('Divided an area into 8 parts')
    expect(edited.commits[0]?.selectedIDs?.length).toBe(8)
  })
})
