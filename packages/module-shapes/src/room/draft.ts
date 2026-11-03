import { distance, item, sub, type Pt } from '../shared/vector.ts'
/**
 * What the pointer means while a room is drawn, in screen pixels: the pure part of the mode (mode.ts), so it can be
 * tested without a map. Tobias, 2026-11-03: the first click starts the room on a wall of the selected building, the
 * guide follows the pointer (Shift: 45 degree steps, Shift+Alt: 10 degree steps, measured from the wall and then from
 * the previous segment), each click inside adds a corner, and a click on a wall ends the room there. From the second
 * corner on, the preview shows the whole room: from the pointer straight back to the wall the room started on.
 */
import { edgeDirection, guidedClosure, guideToWall, nearestOnRing, snapAngle } from './geometry.ts'

/** The angle steps of Shift and of Shift+Alt, in degrees */
export const ANGLE_STEP = 45
export const FINE_ANGLE_STEP = 10

/** The keys that change the angle of the guide */
export type DraftKeys = { shift: boolean; alt: boolean }

/** The room so far: its fixed points on the screen (points[0] on the wall) and the wall edge it started on */
export type Draft = { points: readonly Pt[]; startEdge: number }

/** What the pointer gives now */
export type DraftPointer =
  /** No point yet, and the pointer is not on a wall: a click does nothing */
  | { kind: 'off-wall' }
  /** No point yet: a click starts the room at `at` on edge `edge` */
  | { kind: 'start'; at: Pt; edge: number }
  /** A click adds `next` as a corner. `closure` is the guided end on the wall (from the second corner on). */
  | { kind: 'corner'; next: Pt; guide?: Pt; closure?: Pt }
  /** A click ends the room at `at` on the wall */
  | { kind: 'end'; at: Pt }

/**
 * What the pointer at `pointer` means for the room so far.
 * @param   draft     - The fixed points and the start edge; no points before the first click
 * @param   pointer   - The pointer on the screen
 * @param   ring      - The building's outline on the screen, without the closing repeat
 * @param   keys      - The modifier keys now
 * @param   tolerance - How near a wall the pointer must be to be on it, in pixels
 * @return  What a click would do, and what the preview shows
 */
export function pointerOf(
  draft: Draft,
  pointer: Pt,
  ring: readonly Pt[],
  keys: DraftKeys,
  tolerance: number,
): DraftPointer {
  const wall = nearestOnRing(pointer, ring, tolerance)
  if (draft.points.length === 0) {
    return wall ? { kind: 'start', at: wall.at, edge: wall.edge } : { kind: 'off-wall' }
  }
  const last = item(draft.points, draft.points.length - 1)
  // on a wall, away from the point the room started at: the next click ends the room there
  if (
    wall &&
    distance(wall.at, item(draft.points, 0)) > tolerance &&
    distance(wall.at, last) > tolerance
  )
    return { kind: 'end', at: wall.at }
  const next = keys.shift
    ? snapAngle(last, pointer, referenceOf(draft, ring), stepOf(keys))
    : pointer
  if (draft.points.length === 1)
    return { kind: 'corner', next, guide: guideToWall(last, next, ring) }
  return { kind: 'corner', next, closure: guidedClosure(draft.points, next, ring) }
}

/** The angle step of the keys: 10 degrees with Alt, else 45 */
function stepOf(keys: DraftKeys): number {
  return keys.alt ? FINE_ANGLE_STEP : ANGLE_STEP
}

/** The direction the angles are measured from: the wall for the first segment, then the previous segment */
function referenceOf(draft: Draft, ring: readonly Pt[]): Pt {
  const n = draft.points.length
  if (n < 2) return edgeDirection(ring, draft.startEdge)
  return sub(item(draft.points, n - 1), item(draft.points, n - 2))
}

/**
 * The line that the room's plan gets for the pointer: the fixed points, the corner under the pointer and the guided end;
 * or the fixed points and the end on the wall. Undefined when the pointer gives no room yet.
 * @param   draft   - The room so far
 * @param   pointer - What the pointer gives (pointerOf)
 * @return  The line on the screen, from the first wall to the last
 */
export function lineOf(draft: Draft, pointer: DraftPointer): Pt[] | undefined {
  if (pointer.kind === 'end')
    return draft.points.length >= 1 ? [...draft.points, pointer.at] : undefined
  if (pointer.kind === 'corner' && pointer.closure)
    return [...draft.points, pointer.next, pointer.closure]
  return undefined
}
