/**
 * The state of a tooltip group: one tooltip for all the buttons of a group (the top bar's
 * buttons, a row of tools). Pure: the React layer (Tooltip.tsx) sends events and runs the one
 * timer the state asks for. Time is in milliseconds.
 *
 * - The pointer enters the first button of a closed group: the tooltip opens after `OPEN_DELAY_MS`.
 * - The pointer moves on to another button while the tooltip is open: it switches at once, with
 *   the new label.
 * - The pointer leaves the button: the tooltip stays for `CLOSE_GRACE_MS` (a move to the next
 *   button in that time switches it), then closes.
 * - Keyboard focus shows it at once. A press (a click) closes it until the pointer leaves that button.
 */

export const OPEN_DELAY_MS = 400
export const CLOSE_GRACE_MS = 150

export type TipPlacement = 'top' | 'bottom' | 'left' | 'right'

/** A modifier key and what it does: `keys` in the neutral form of shortcut-label.ts (`Shift`, `Shift+Alt`) */
export type TooltipHint = { keys: string; text: string }

/** What a tooltip says about one button */
export type TipContent = {
  label: string
  /** A shortcut in the neutral form that shortcut-label.ts reads, e.g. `Mod+F` */
  shortcut?: string
  description?: string
  /** Modifier keys and what they do, one row each under the label (see `TooltipHint`) */
  hints?: readonly TooltipHint[]
  placement: TipPlacement
}

export type TipTarget = { id: string; content: TipContent }

/**
 * `closed`: nothing shown; `pending`: the pointer is on a button, waiting for the delay; `open`:
 * shown; `closing`: still shown, leaving after the grace period.
 */
export type TipPhase = 'closed' | 'pending' | 'open' | 'closing'

export type TipTimer = { kind: 'open' | 'close' }

export type TipState = {
  phase: TipPhase
  /** The button the tooltip is about. Kept after closing, so the box can leave with its label. */
  target: TipTarget | null
  /** A button that was pressed: no tooltip for it until the pointer leaves it */
  suppressed: string | null
  /** The timer the React layer runs; a new object each time one is started, null when none runs */
  timer: TipTimer | null
}

export type TipEvent =
  | { type: 'enter'; id: string; content: TipContent }
  | { type: 'focus'; id: string; content: TipContent }
  /** The pointer or the focus left the button */
  | { type: 'leave'; id: string }
  | { type: 'press'; id: string }
  /** The timer ran out */
  | { type: 'timeout' }

export const INITIAL_TIP: TipState = {
  phase: 'closed',
  target: null,
  suppressed: null,
  timer: null,
}

/** How long a timer runs */
export function tipDelay(kind: TipTimer['kind']): number {
  return kind === 'open' ? OPEN_DELAY_MS : CLOSE_GRACE_MS
}

/** The next state for one event. Never mutates `state`. */
export function reduceTip(state: TipState, event: TipEvent): TipState {
  switch (event.type) {
    case 'enter':
    case 'focus': {
      if (state.suppressed === event.id) return state
      const target = { id: event.id, content: event.content }
      // keyboard focus shows at once, and so does a pointer that moves on while the tooltip is up
      if (event.type === 'focus' || state.phase === 'open' || state.phase === 'closing') {
        return { phase: 'open', target, suppressed: null, timer: null }
      }
      return { phase: 'pending', target, suppressed: null, timer: { kind: 'open' } }
    }
    case 'leave': {
      // a leave from a button that is no longer the target (it was switched already) changes nothing
      if (state.target?.id !== event.id) return state
      if (state.suppressed === event.id) return { ...state, suppressed: null }
      if (state.phase === 'pending') return { ...state, phase: 'closed', timer: null }
      if (state.phase === 'open') return { ...state, phase: 'closing', timer: { kind: 'close' } }
      return state
    }
    case 'press':
      return { ...state, phase: 'closed', suppressed: event.id, timer: null }
    case 'timeout':
      if (state.phase === 'pending') return { ...state, phase: 'open', timer: null }
      if (state.phase === 'closing') return { ...state, phase: 'closed', timer: null }
      return { ...state, timer: null }
  }
}
