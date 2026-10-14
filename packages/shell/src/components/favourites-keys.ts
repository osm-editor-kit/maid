/**
 * The keys that start a favourite feature type by its number: hold the modifier, type the digits,
 * release the modifier. The favourite with that number is started.
 *
 * The modifier is Alt on every platform. Ctrl+digit and Cmd+digit switch browser tabs (Cmd+1 to
 * Cmd+9 on macOS, Ctrl+1 to Ctrl+9 on Windows and Linux), so they are out. Shift+digit types a
 * symbol on the common layouts, so it is out. The hotkey library matches the modifiers exactly, so
 * Alt+1 does not start the draw mode that the plain 1 starts, and no other editor key has Alt. On
 * macOS Option+digit types a character, so the digit is read from `event.code` (Digit3, Numpad3):
 * the layout and Option do not matter, and the keys this sequence takes are not passed on.
 *
 * Everything here is pure: the sequence is a reducer over the key events, and the caller decides
 * what a number starts.
 */

/** The modifier key's name in `KeyboardEvent.key` */
export const FAVOURITE_MODIFIER = 'Alt'

/**
 * Where a sequence is. `digits` are the digits typed while the modifier is down: a number without
 * a leading zero, or empty. `cancelled` is set by Escape: nothing starts when the modifier is let go.
 */
export type SequenceState = {
  held: boolean
  digits: string
  cancelled: boolean
}

export const IDLE: SequenceState = { held: false, digits: '', cancelled: false }

/** What happened: the modifier went down or up, a digit or Backspace was typed, Escape, or the window lost focus */
export type SequenceEvent =
  | { type: 'modifier-down' }
  | { type: 'modifier-up' }
  | { type: 'digit'; digit: string }
  | { type: 'backspace' }
  | { type: 'escape' }
  | { type: 'blur' }

/** The next state, and the number to start when the modifier was let go with digits typed */
export type SequenceStep = { state: SequenceState; start?: string }

/** A sequence takes digits only while the modifier is down and Escape has not cancelled it */
function taking(state: SequenceState) {
  return state.held && !state.cancelled
}

/**
 * One step of the sequence. Digits, Backspace and Escape do nothing without the modifier, so the
 * keys of the editor are not touched. A leading zero is ignored: `0` cannot start a number, and
 * `03` is `3`. Releasing the modifier starts the typed number, if there is one.
 */
export function advance(state: SequenceState, event: SequenceEvent): SequenceStep {
  switch (event.type) {
    case 'modifier-down':
      // a key that repeats while held does not start a new sequence
      return { state: state.held ? state : { held: true, digits: '', cancelled: false } }
    case 'modifier-up': {
      const start = taking(state) && state.digits !== '' ? state.digits : undefined
      return { state: IDLE, start }
    }
    case 'blur':
      return { state: IDLE }
    case 'escape':
      return { state: state.held ? { held: true, digits: '', cancelled: true } : state }
    case 'backspace':
      if (!taking(state)) return { state }
      return { state: { ...state, digits: state.digits.slice(0, -1) } }
    case 'digit':
      if (!taking(state) || !/^[0-9]$/.test(event.digit)) return { state }
      if (state.digits === '' && event.digit === '0') return { state }
      return { state: { ...state, digits: state.digits + event.digit } }
  }
}

/** The digit a key code stands for: Digit3 and Numpad3 are "3", anything else is undefined */
export function digitOfCode(code: string): string | undefined {
  return /^(?:Digit|Numpad)([0-9])$/.exec(code)?.[1]
}

/** What a keyboard event tells the sequence, as the fields of `KeyboardEvent` that matter here */
export type KeyInput = {
  type: 'keydown' | 'keyup'
  key: string
  code: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  repeat: boolean
  /** The target is a text field, a text area or editable text: its keys are the field's own */
  inField: boolean
}

/**
 * The sequence event a key event means, or undefined when it means none. A digit, Backspace or
 * Escape counts only with the modifier alone: with Ctrl, Cmd or Shift held it is another shortcut.
 * A key that repeats does not type again.
 */
export function sequenceEventOf(input: KeyInput): SequenceEvent | undefined {
  if (input.key === FAVOURITE_MODIFIER) {
    if (input.type === 'keyup') return { type: 'modifier-up' }
    return input.repeat ? undefined : { type: 'modifier-down' }
  }
  if (input.type !== 'keydown' || input.inField) return undefined
  if (!input.altKey || input.ctrlKey || input.metaKey || input.shiftKey) return undefined
  const digit = digitOfCode(input.code)
  if (digit !== undefined) return input.repeat ? undefined : { type: 'digit', digit }
  if (input.key === 'Backspace') return { type: 'backspace' }
  if (input.key === 'Escape') return { type: 'escape' }
  return undefined
}
