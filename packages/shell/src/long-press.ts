/**
 * A long press: a finger or a held button that stays where it went down for a while. Shared by the map (the edit
 * menu, Shift while drawing) and the Area button (its dropdown), so the time and the tolerance are one constant.
 */

/** How long a press must stay still to be a long press (ms). iD uses the same delay for its touch menu. */
export const LONG_PRESS_MS = 500
/**
 * How far a press may wander (px) and still be a long press. A finger that moves further pans, drags or taps: a
 * small wobble of the finger is not a move.
 */
export const LONG_PRESS_MOVE_PX = 8

export type Point = { x: number; y: number }

/** `pressing`: down and still waiting. `active`: the time has passed while it stayed still. */
export type LongPressState = 'idle' | 'pressing' | 'active'

/**
 * One press at a time. `start` arms the timer, `move` cancels a press that is still waiting once it is beyond the
 * tolerance (an active press goes on: a Shift hold moves with the finger), `end` ends it. `onActive` runs once, when
 * the time passes. Each owner (the map, the button) makes its own instance, so the timers are not shared.
 */
export class LongPress {
  private timer: ReturnType<typeof setTimeout> | undefined
  private origin: Point | undefined
  private last: Point | undefined
  private phase: LongPressState = 'idle'

  constructor(
    private readonly delay = LONG_PRESS_MS,
    private readonly tolerance = LONG_PRESS_MOVE_PX,
  ) {}

  get state(): LongPressState {
    return this.phase
  }

  /** Where the press is now: where it went down, or the last move within the tolerance */
  get at(): Point | undefined {
    return this.last
  }

  /** A press went down at `at`. A press that is still under way is replaced: only the latest one can fire. */
  start(at: Point, onActive: (at: Point) => void) {
    this.cancel()
    this.phase = 'pressing'
    this.origin = at
    this.last = at
    this.timer = setTimeout(() => {
      this.timer = undefined
      this.phase = 'active'
      onActive(this.last ?? at)
    }, this.delay)
  }

  /** The pointer is at `at`. Beyond the tolerance a waiting press is cancelled; an active one only moves on. */
  move(at: Point) {
    if (this.phase === 'idle' || !this.origin) return
    if (this.phase === 'pressing' && distance(at, this.origin) > this.tolerance) {
      this.cancel()
      return
    }
    this.last = at
  }

  /** The press is over (the finger lifted, or another gesture took it). True if it had become active. */
  end(): boolean {
    const wasActive = this.phase === 'active'
    this.cancel()
    return wasActive
  }

  /** Forgets the press without a result: no timer is left to fire */
  cancel() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
    this.origin = undefined
    this.last = undefined
    this.phase = 'idle'
  }
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}
