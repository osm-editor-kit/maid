/**
 * Keys of the sheet, as data: which action a key press means, or that the input should handle it.
 * Pure: takes a plain object with the key and its modifiers, so it can be tested without a DOM.
 * The grid runs the result (dispatch, commitEdit, clearSelection, the clipboard) and calls preventDefault
 * when `prevent` is true.
 */
import { stepTarget } from './reducer'
import type { EndThen, SheetAction, SheetShape, SheetState } from './types'

/** The parts of a keyboard event this layer reads. A DOM KeyboardEvent has all of them. */
export type SheetKeyEvent = {
  key: string
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  /** True during an IME composition: every key is then the IME's. */
  isComposing?: boolean
}

/** `mac`: Cmd (meta) is the command key; elsewhere Ctrl is. */
export type SheetKeyOptions = { mac: boolean }

/**
 * What a key means.
 * - `action`: dispatch it to sheetReducer. `prevent` false for a key that must also reach the input (typing).
 * - `commit`: edit mode: commitEdit with the draft, then `endEdit(after)`. `prevent` false when the browser
 *   should move the focus out of the sheet (Tab at the last or first cell).
 * - `arrow`: edit mode Up or Down: the suggestion list takes it when open; else commitEdit with `arrowDown` or
 *   `arrowUp`.
 * - `cancel`: edit mode Escape: drop the draft, then `endEdit` with 'stay'.
 * - `clear`: navigation Delete or Backspace: clearSelection, one batch.
 * - `clipboard`: navigation copy, cut or paste (the grid runs the clipboard plan).
 * - `undo` / `redo`: navigation Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, Ctrl+Y: the host's history.
 * - `native`: the input handles the key (no preventDefault).
 */
export type SheetKeyResult =
  | { kind: 'action'; action: SheetAction; prevent: boolean }
  | { kind: 'commit'; after: EndThen; prevent: boolean }
  | { kind: 'arrow'; dy: -1 | 1 }
  | { kind: 'cancel' }
  | { kind: 'clear' }
  | { kind: 'clipboard'; op: 'copy' | 'cut' | 'paste' }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'native' }

const NATIVE: SheetKeyResult = { kind: 'native' }

/** Arrow keys as steps. */
function arrowStep(key: string): { dx: -1 | 0 | 1; dy: -1 | 0 | 1 } | undefined {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -1, dy: 0 }
    case 'ArrowRight':
      return { dx: 1, dy: 0 }
    case 'ArrowUp':
      return { dx: 0, dy: -1 }
    case 'ArrowDown':
      return { dx: 0, dy: 1 }
    default:
      return undefined
  }
}

/** A key that types a character: one code point, or the start of a dead key or an IME. */
function startsText(key: string): boolean {
  return Array.from(key).length === 1 || key === 'Dead' || key === 'Process'
}

/**
 * The meaning of one key press in the sheet's current mode.
 *
 * Navigation: arrows move (Shift extends, Cmd/Ctrl goes to the edge), Tab and Shift+Tab move and wrap, leaving
 * the sheet at its two ends; Enter, F2 and typing edit; Escape collapses a range; Delete and Backspace clear;
 * Home and End go to the row's ends; Shift+Space selects the row; Cmd/Ctrl+A, C, X, V, Z and Y as in the design.
 *
 * Edit: Enter and Shift+Enter commit and go down or up; Tab and Shift+Tab commit and move; Up and Down
 * are the list's or commit and move; Escape drops the draft. Everything else is the input's.
 */
export function actionForKey(
  event: SheetKeyEvent,
  state: SheetState,
  shape: SheetShape,
  options: SheetKeyOptions,
): SheetKeyResult {
  if (event.isComposing === true || event.altKey) return NATIVE
  const mod = options.mac ? event.metaKey : event.ctrlKey
  const otherMod = options.mac ? event.ctrlKey : event.metaKey
  if (otherMod) return NATIVE
  // Lower-case letters so that Shift+Z matches 'z'; other keys are compared as they are.
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key

  if (state.mode === 'edit') {
    if (mod || state.active === null) return NATIVE
    return editKey(key, event.shiftKey, state, shape)
  }
  return navigateKey(event, key, mod, state, shape, options)
}

function editKey(
  key: string,
  shift: boolean,
  state: SheetState,
  shape: SheetShape,
): SheetKeyResult {
  switch (key) {
    case 'Enter':
      return { kind: 'commit', after: shift ? 'up' : 'down', prevent: true }
    case 'Tab': {
      const dx: -1 | 1 = shift ? -1 : 1
      // A Tab that finds no cell leaves the sheet: the commit happens, the browser moves the focus.
      const atEnd =
        state.active === null ||
        stepTarget(state.active, shape, { dx, dy: 0, wrap: true }) === undefined
      return { kind: 'commit', after: shift ? 'previous' : 'next', prevent: !atEnd }
    }
    // Shift+Up and Shift+Down select text in the input.
    case 'ArrowUp':
      return shift ? NATIVE : { kind: 'arrow', dy: -1 }
    case 'ArrowDown':
      return shift ? NATIVE : { kind: 'arrow', dy: 1 }
    case 'Escape':
      return { kind: 'cancel' }
    default:
      return NATIVE
  }
}

function navigateKey(
  event: SheetKeyEvent,
  key: string,
  mod: boolean,
  state: SheetState,
  shape: SheetShape,
  options: SheetKeyOptions,
): SheetKeyResult {
  const shift = event.shiftKey
  const at = state.active

  if (mod) {
    if (key === 'a') return { kind: 'action', action: { type: 'selectAll' }, prevent: true }
    if (at === null) return NATIVE
    const step = arrowStep(key)
    if (step !== undefined) {
      return {
        kind: 'action',
        action: { type: 'move', ...step, edge: true, extend: shift },
        prevent: true,
      }
    }
    switch (key) {
      case 'c':
        return { kind: 'clipboard', op: 'copy' }
      case 'x':
        return { kind: 'clipboard', op: 'cut' }
      case 'v':
        return { kind: 'clipboard', op: 'paste' }
      case 'z':
        return shift ? { kind: 'redo' } : { kind: 'undo' }
      case 'y':
        return options.mac ? NATIVE : { kind: 'redo' }
      default:
        return NATIVE
    }
  }

  if (at === null) return NATIVE

  const step = arrowStep(key)
  if (step !== undefined) {
    return { kind: 'action', action: { type: 'move', ...step, extend: shift }, prevent: true }
  }

  switch (key) {
    case 'Tab': {
      const dx: -1 | 1 = shift ? -1 : 1
      const target = stepTarget(at, shape, { dx, dy: 0, wrap: true })
      // No cell that way: the browser moves the focus out of the sheet.
      if (target === undefined) return NATIVE
      return { kind: 'action', action: { type: 'move', dx, dy: 0, wrap: true }, prevent: true }
    }
    case 'Enter':
      if (shift) return { kind: 'action', action: { type: 'move', dx: 0, dy: -1 }, prevent: true }
      if (shape.readOnly(at)) return NATIVE
      return { kind: 'action', action: { type: 'startEdit', how: 'keep' }, prevent: true }
    case 'F2':
      if (shape.readOnly(at)) return NATIVE
      return { kind: 'action', action: { type: 'startEdit', how: 'keep' }, prevent: true }
    case 'Escape':
      if (state.anchor === null && !state.rowsSelected) return NATIVE
      return { kind: 'action', action: { type: 'collapse' }, prevent: true }
    case 'Delete':
    case 'Backspace':
      return { kind: 'clear' }
    case 'Home':
      return {
        kind: 'action',
        action: { type: 'move', dx: -1, dy: 0, edge: true, extend: shift },
        prevent: true,
      }
    case 'End':
      return {
        kind: 'action',
        action: { type: 'move', dx: 1, dy: 0, edge: true, extend: shift },
        prevent: true,
      }
    case ' ':
      if (shift)
        return { kind: 'action', action: { type: 'selectRows', from: at.row }, prevent: true }
      break
    default:
      break
  }

  // Typing starts an edit that replaces the text. The input itself gets the key (prevent false), after the
  // host has made it writable and selected its text.
  if (startsText(event.key)) {
    if (shape.readOnly(at)) return NATIVE
    return { kind: 'action', action: { type: 'startEdit', how: 'replace' }, prevent: false }
  }
  return NATIVE
}
