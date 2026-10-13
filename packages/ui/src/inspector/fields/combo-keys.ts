import type { FieldOption } from '@osm-editor-kit/maid-presets'
import { filterOptions } from './combo-logic.ts'

/**
 * The keys of a combo input as pure functions over its state. ComboInput.tsx keeps the state and applies
 * what these return; the rules are iD's combobox.js (pinned checkout, `.reference/id`):
 * - typing completes the first option whose label or value starts with the typed text, an exact match
 *   wins over an earlier prefix; the completed part is selected, so the next key replaces it;
 * - a number is not completed (iD #4935); nothing is completed unless the caret is at the end;
 * - Backspace and Delete remove a completion and do not complete the next typing (iD does not);
 * - ArrowDown and ArrowUp move through the list, clamped at both ends (iD does not wrap), and put the
 *   option's label in the input; the list does not refilter, so the arrows do not change the list;
 * - Enter and Tab accept the highlighted option or the text; Escape restores the text the field had
 *   before typing (Maid's rule; iD keeps the typed text and drops only the completion).
 */

/** The state of one combo input. */
export type ComboKeyState = {
  /** The text the input shows: typed, or an option's label after an arrow or a choice. */
  text: string
  /** The text the list is filtered by. Undefined until the person types: the list is then every option. */
  query: string | undefined
  /** The completed part of `text`, as indexes (from the typed length to the end). Undefined when none. */
  completion: { start: number; end: number } | undefined
  /** The highlighted option, an index into the list; -1 for none. */
  active: number
  /** The list is shown (when there are options to show). */
  open: boolean
  /** Set by Backspace or Delete: the next typed text does not complete. */
  noComplete: boolean
}

/** What the keys read from the field. */
export type ComboKeyEnv = {
  /** The options of the field, without the unset ones. */
  options: readonly FieldOption[]
  /** iD's caseSensitive: the completion keeps the case of the options as typed. */
  caseSensitive?: boolean
  /** Inline completion while typing. Default true (iD's canAutocomplete). */
  autoComplete?: boolean
  /**
   * The options are already the answer to the typed text (a search of a source, as the Wikipedia field's):
   * the list is the options as given, not filtered again. Completion is off with it.
   */
  listed?: boolean
}

/** A key's result: the new state, and whether the input should commit now (Enter: blur). */
export type ComboKeyResult = { state: ComboKeyState; commit: boolean }

/** The state of an input that shows `text` and has not been touched. */
export function comboStart(text: string): ComboKeyState {
  return {
    text,
    query: undefined,
    completion: undefined,
    active: -1,
    open: false,
    noComplete: false,
  }
}

/** The options the list shows: all of them until the person types, then those that match the typed text. */
export function comboList(env: ComboKeyEnv, state: ComboKeyState): readonly FieldOption[] {
  if (env.listed) return env.options
  return filterOptions(env.options, state.query ?? '')
}

/** The option that is highlighted and shown, or undefined. */
export function comboPicked(env: ComboKeyEnv, state: ComboKeyState): FieldOption | undefined {
  if (!state.open || state.active < 0) return undefined
  return comboList(env, state)[state.active]
}

/** The completion of a typed text: the candidate's text and the list index of its option. */
type Completion = { text: string; index: number }

/**
 * iD's tryAutocomplete over the list: the candidates are each option's label and its value (as iD's
 * suggestionValues). An exact match wins; otherwise the first candidate that starts with the text.
 */
function completionOf(
  results: readonly FieldOption[],
  typed: string,
  caseSensitive: boolean,
): Completion | undefined {
  if (typed.trim() === '' || Number.isFinite(Number(typed))) return undefined
  const fold = (text: string) => (caseSensitive ? text : text.toLowerCase())
  const wanted = fold(typed)
  const candidates: Completion[] = []
  results.forEach((option, index) => {
    candidates.push({ text: option.label, index })
    if (option.value !== option.label) candidates.push({ text: option.value, index })
  })
  const exact = candidates.find((candidate) => fold(candidate.text) === wanted)
  if (exact) return exact
  return candidates.find((candidate) => fold(candidate.text).startsWith(wanted))
}

/** The state after a choice or a commit: the text is final, the list is closed, nothing is completed. */
export function comboSettle(state: ComboKeyState, text: string): ComboKeyState {
  return {
    ...state,
    text,
    query: undefined,
    completion: undefined,
    active: -1,
    open: false,
    noComplete: false,
  }
}

/**
 * The text the input has after a typing or a deletion, as the DOM reports it. `caretAtEnd` is whether
 * the caret is at the end of `text` (iD completes only then). The list refilters by `text`.
 */
export function comboType(
  env: ComboKeyEnv,
  state: ComboKeyState,
  text: string,
  caretAtEnd: boolean,
): ComboKeyState {
  const typed: ComboKeyState = {
    ...state,
    text,
    query: text,
    completion: undefined,
    active: -1,
    open: text !== '',
    noComplete: false,
  }
  if (
    state.noComplete ||
    env.autoComplete === false ||
    env.listed === true ||
    !caretAtEnd ||
    text === ''
  )
    return typed
  const results = filterOptions(env.options, text)
  const found = completionOf(results, text, env.caseSensitive === true)
  if (!found) return typed
  const completion =
    found.text.length > text.length ? { start: text.length, end: found.text.length } : undefined
  return { ...typed, text: found.text, completion, active: found.index }
}

/** ArrowDown (delta 1) or ArrowUp (delta -1): highlights the next option and puts its label in the input. */
export function comboArrow(env: ComboKeyEnv, state: ComboKeyState, delta: 1 | -1): ComboKeyState {
  const results = comboList(env, state)
  if (results.length === 0) return { ...state, open: true, active: -1 }
  const from = state.open && state.active >= 0 ? state.active : -1
  const index = Math.min(Math.max(from + delta, 0), results.length - 1)
  const option = results[index]
  if (option === undefined) return { ...state, open: true, active: -1 }
  return { ...state, open: true, active: index, text: option.label, completion: undefined }
}

/** Enter: accepts the highlighted option (its label) or the text, closes the list, and commits (blur). */
export function comboEnter(env: ComboKeyEnv, state: ComboKeyState): ComboKeyResult {
  const picked = comboPicked(env, state)
  return { state: comboSettle(state, picked ? picked.label : state.text), commit: true }
}

/**
 * Tab: as Enter, but the focus moves on and the blur commits. The state is settled here, so the
 * commit reads the chosen label.
 */
export function comboTab(env: ComboKeyEnv, state: ComboKeyState): ComboKeyResult {
  const picked = comboPicked(env, state)
  return { state: comboSettle(state, picked ? picked.label : state.text), commit: false }
}

/** Escape: the text the field had before typing (`shown`), the list closed. */
export function comboEscape(state: ComboKeyState, shown: string): ComboKeyState {
  return comboSettle(state, shown)
}

/**
 * Backspace or Delete. With a completion selected it removes the completion (the key is handled: the
 * caller prevents the default). Otherwise the browser deletes a character, and the next typed text does
 * not complete (`noComplete`).
 */
export function comboDelete(state: ComboKeyState): { state: ComboKeyState; handled: boolean } {
  if (state.completion) {
    const text = state.text.slice(0, state.completion.start)
    return {
      state: {
        ...state,
        text,
        query: text,
        completion: undefined,
        active: -1,
        open: state.open && text !== '',
        noComplete: false,
      },
      handled: true,
    }
  }
  return { state: { ...state, noComplete: true }, handled: false }
}

/** A click on an option: its label is the text; the caller then commits (blur). */
export function comboChoose(state: ComboKeyState, label: string): ComboKeyState {
  return comboSettle(state, label)
}

/** A click on the field: the list opens with every option (iD shows the full list on a click). */
export function comboOpen(state: ComboKeyState): ComboKeyState {
  return { ...state, open: true, query: undefined, active: -1 }
}
