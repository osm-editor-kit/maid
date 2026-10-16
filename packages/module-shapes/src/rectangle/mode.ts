/**
 * The mode that takes the pointer while a rectangle is drawn (ADR 0011, hook 4). It turns each map event into an event
 * of the state machine (state.ts), shows the preview (store.ts), and on the third click writes the rectangle
 * (commit.ts) and hands the new way to the shell. Escape ends the mode with nothing written (the engine does that).
 */
import type { Editor } from '@osm-editor-kit/maid-core'
import type { MaidEngine, ModuleMode, ModuleModeInfo } from '@osm-editor-kit/maid-renderer'
import { commitRectangle } from './commit.ts'
import type { Loc } from './rectangle.ts'
import {
  type Corner,
  type RectangleEnv,
  type RectangleEvent,
  previewOf,
  reduce,
  SNAP_PX,
  START,
  type Stage,
  type Step,
} from './state.ts'
import { rectangleActions } from './store.ts'

/** The id of the tool and of its mode: the Area button's dropdown marks the tool pressed while its mode is on */
export const RECTANGLE_ID = 'rectangle'

type SnapTarget = NonNullable<ModuleModeInfo['target']>

/**
 * The engine's snap takes every node that its query box touches, so a node found by it can lie farther than SNAP_PX
 * from the pointer (a vertex's circle reaches into the box). A corner reuses a node only within SNAP_PX.
 */
function nodeWithinSnap(engine: MaidEngine, node: { loc: Loc }, loc: Loc): boolean {
  const map = engine.map
  if (!map) return false
  const p = map.project(node.loc)
  const q = map.project(loc)
  return Math.hypot(p.x - q.x, p.y - q.y) <= SNAP_PX
}

/** The corner a click or a move found: the node or the place on a way under the pointer, else open ground */
function cornerOf(engine: MaidEngine, target: SnapTarget | undefined, loc: Loc): Corner {
  if (target?.type === 'node' && nodeWithinSnap(engine, target, loc))
    return { type: 'node', id: target.id, loc: target.loc }
  // a midpoint is added to the way, so a way that is read-only stays as it is
  if (target?.type === 'way' && !engine.isReadOnly(target.wayId))
    return { type: 'way', wayId: target.wayId, loc: target.loc, edge: target.edge }
  return { type: 'free', loc }
}

/**
 * The corner for D or E: an existing node that the snap finds within SNAP_PX of that place, else open ground. Only
 * nodes are reused here, as the research asks; a way is never split by a corner that is not clicked.
 */
function nodeCornerAt(engine: MaidEngine, screen: { x: number; y: number }, loc: Loc): Corner {
  const layers = engine.pointer?.layers ?? []
  const target = layers.length > 0 ? engine.snapAt(screen, layers, new Set()) : undefined
  if (target?.type === 'node' && nodeWithinSnap(engine, target, loc))
    return { type: 'node', id: target.id, loc: target.loc }
  return { type: 'free', loc }
}

/** The mode for one drawing of a rectangle. Its stage is kept here, as the mode's own state. */
export function rectangleMode(editor: Editor, engine: MaidEngine): ModuleMode {
  let stage: Stage = START

  /** One event of the map: the state machine's step, the preview, and the write on the third click */
  const feed = (event: RectangleEvent): void => {
    const map = engine.map
    if (!map) return
    const env: RectangleEnv = {
      project: (loc) => {
        const p = map.project(loc)
        return { x: p.x, y: p.y }
      },
      nodeCorner: (loc) => nodeCornerAt(engine, map.project(loc), loc),
    }
    const step: Step = reduce(stage, event, env)
    stage = step.stage
    if (step.commit) {
      const wayId = commitRectangle(engine, editor, step.commit)
      // the mode ends with its one undo step; the shell then selects the way and asks for its type
      engine.exitModuleMode(RECTANGLE_ID)
      engine.announceDrawn(wayId)
      return
    }
    rectangleActions.show(previewOf(stage, env))
  }

  return {
    id: RECTANGLE_ID,
    cursor: 'crosshair',
    snap: true,
    onMove: (lon, lat) => feed({ type: 'move', loc: [lon, lat] }),
    onClick: (lon, lat, info) =>
      feed({ type: 'click', loc: [lon, lat], target: cornerOf(engine, info.target, [lon, lat]) }),
    onKey: (key) => {
      // Enter does nothing here; Backspace after B goes back to choosing B, and only then is it the mode's
      if (key !== 'Backspace') return false
      const before = stage.step
      feed({ type: 'back' })
      return before === 'depth'
    },
    onExit: () => {
      stage = START
      rectangleActions.clear()
    },
  }
}
