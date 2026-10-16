/**
 * The three-click rectangle as a state machine, with no map and no data. A click on the map gives the corner it hit
 * (a node, a place on a way, or open ground); `reduce` says what that does to the stage, and when the third click
 * commits, the four corners of the ring in order A, B, E, D. The mode (mode.ts) feeds it and writes the result.
 * Plan: docs/research/drawing-tools/2-three-click-rectangle.md, sections 2 and 3.
 */
import { SNAP_PX } from '@osm-editor-kit/maid-renderer'
import { type Loc, MIN_DEPTH_PX, rectangleCorners, screenDepth } from './rectangle.ts'

type Point = { x: number; y: number }

/**
 * A corner of the rectangle as the pointer found it. A node is reused. A place on a way gets a new node inserted into
 * that way. Open ground gets a new node. The third and fourth corners (E and D) only take a node or open ground.
 */
export type Corner =
  | { type: 'node'; id: string; loc: Loc }
  | { type: 'way'; wayId: string; loc: Loc; edge: [string, string] }
  | { type: 'free'; loc: Loc }

/**
 * Where the drawing stands. `first`: no corner yet. `second`: A is set, the wall follows the pointer. `depth`: the wall
 * AB is set and the pointer gives the depth of the rectangle. `pointer` is the last place of the pointer, if any.
 */
export type Stage =
  | { step: 'first'; pointer?: Loc }
  | { step: 'second'; a: Corner; pointer?: Loc }
  | { step: 'depth'; a: Corner; b: Corner; pointer?: Loc }

export const START: Stage = { step: 'first' }

export type RectangleEvent =
  /** A click: `target` is the corner under the pointer (open ground when nothing is) */
  | { type: 'click'; loc: Loc; target: Corner }
  /** The pointer moved over the map */
  | { type: 'move'; loc: Loc }
  /** Backspace: after B, back to choosing B */
  | { type: 'back' }

/** What the mode needs from the map: the screen position of a place, and the corner of a point of the ring */
export interface RectangleEnv {
  project(loc: Loc): Point
  /** A corner for D or E: an existing node within the snap distance, else open ground. Never a way. */
  nodeCorner(loc: Loc): Corner
}

/** The four corners in ring order: A, B, E, D. The ring is closed by the first corner when written. */
export type Ring = [Corner, Corner, Corner, Corner]

/** Why a click did not commit or set a corner. The mode says nothing of it; the tests check it. */
export type Refusal = 'same-spot' | 'shared-edge' | 'shallow' | 'same-node'

export type Step = { stage: Stage; refused?: Refusal; commit?: Ring }

/** What the preview draws: the wall (A to B, or A to the pointer) and the rectangle once it has its depth */
export type Preview = { wall?: [Loc, Loc]; rectangle?: Loc[] }

/** The screen distance of the pointer from the wall AB, in pixels, as the depth guard reads it */
function depthPx(env: RectangleEnv, a: Loc, b: Loc, c: Loc): number {
  return screenDepth(env.project(a), env.project(b), env.project(c))
}

/** Two corners that are one spot: the same node, or two places within the snap distance on the screen */
function sameSpot(env: RectangleEnv, a: Corner, b: Corner): boolean {
  if (a.type === 'node' && b.type === 'node' && a.id === b.id) return true
  const pa = env.project(a.loc)
  const pb = env.project(b.loc)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y) <= SNAP_PX
}

/**
 * Two places on the same edge of one way. A midpoint is inserted into the edge for each, and the second insert would
 * find the edge already split. Refused rather than guessed.
 */
function sharedEdge(a: Corner, b: Corner): boolean {
  if (a.type !== 'way' || b.type !== 'way' || a.wayId !== b.wayId) return false
  const [a0, a1] = a.edge
  const [b0, b1] = b.edge
  return (a0 === b0 && a1 === b1) || (a0 === b1 && a1 === b0)
}

/** A node that would appear twice in the ring: the rectangle would be a degenerate shape */
function hasSameNode(ring: Ring): boolean {
  const ids = ring.flatMap((corner) => (corner.type === 'node' ? [corner.id] : []))
  return new Set(ids).size !== ids.length
}

/**
 * The next stage for one event. Refusals keep the stage: a refused click leaves the mode waiting, and nothing is
 * committed. Only the third click that passes the depth guard and the same-node check gives `commit`.
 */
export function reduce(stage: Stage, event: RectangleEvent, env: RectangleEnv): Step {
  if (event.type === 'move') return { stage: { ...stage, pointer: event.loc } }

  if (event.type === 'back') {
    if (stage.step !== 'depth') return { stage }
    return { stage: { step: 'second', a: stage.a, pointer: stage.pointer } }
  }

  switch (stage.step) {
    case 'first':
      return { stage: { step: 'second', a: event.target, pointer: event.loc } }

    case 'second': {
      if (sameSpot(env, stage.a, event.target)) return { stage, refused: 'same-spot' }
      if (sharedEdge(stage.a, event.target)) return { stage, refused: 'shared-edge' }
      return {
        stage: { step: 'depth', a: stage.a, b: event.target, pointer: event.loc },
      }
    }

    case 'depth': {
      const { a, b } = stage
      const shape = rectangleCorners(a.loc, b.loc, event.loc)
      if (!shape || Math.abs(depthPx(env, a.loc, b.loc, event.loc)) < MIN_DEPTH_PX)
        return { stage: { ...stage, pointer: event.loc }, refused: 'shallow' }
      const ring: Ring = [a, b, env.nodeCorner(shape.e), env.nodeCorner(shape.d)]
      if (hasSameNode(ring))
        return { stage: { ...stage, pointer: event.loc }, refused: 'same-node' }
      return { stage: START, commit: ring }
    }
  }
}

/** What the preview draws for a stage: nothing before A, the wall after A, and the rectangle once it has a depth */
export function previewOf(stage: Stage, env: RectangleEnv): Preview {
  if (stage.step === 'first' || stage.pointer === undefined) return {}
  if (stage.step === 'second') return { wall: [stage.a.loc, stage.pointer] }
  const { a, b } = stage
  const wall: [Loc, Loc] = [a.loc, b.loc]
  const shape = rectangleCorners(a.loc, b.loc, stage.pointer)
  if (!shape || Math.abs(depthPx(env, a.loc, b.loc, stage.pointer)) < MIN_DEPTH_PX) return { wall }
  return { wall, rectangle: [a.loc, b.loc, shape.e, shape.d] }
}
