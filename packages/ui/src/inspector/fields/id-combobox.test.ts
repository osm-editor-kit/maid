// Adopted from iD test/spec/ui/combobox.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's combobox is a D3 widget that completes the typed text inline. Maid's ComboInput keeps the same rules
// as pure functions (combo-keys.ts): typing completes, the arrows move, Enter and Tab accept, Escape cancels.
// Each iD case below keeps iD's name. Where Maid differs, the test says so.
import { describe, expect, it } from 'bun:test'
import type { FieldOption } from '@osm-editor-kit/maid-presets'
import {
  comboArrow,
  comboDelete,
  comboEnter,
  comboEscape,
  comboList,
  comboPicked,
  comboStart,
  comboTab,
  comboType,
  type ComboKeyEnv,
  type ComboKeyState,
} from './combo-keys.ts'
import { filterOptions } from './combo-logic.ts'

/** iD's spec data, in its order. */
const data: FieldOption[] = [
  { value: 'foobar', label: 'foobar' },
  { value: 'foo', label: 'foo' },
  { value: 'bar', label: 'bar' },
  { value: 'Baz', label: 'Baz' },
  { value: 'test', label: 'test' },
]

/** A key as the browser sends it: a typed character replaces a selected completion. */
function press(state: ComboKeyState, ch: string, env: ComboKeyEnv): ComboKeyState {
  const prefix = state.completion ? state.text.slice(0, state.completion.start) : state.text
  return comboType(env, state, prefix + ch, true)
}

function typed(text: string, env: ComboKeyEnv = { options: data }): ComboKeyState {
  let state = comboStart('')
  for (const ch of text) state = press(state, ch, env)
  return state
}

describe('uiCombobox', () => {
  // n/a: 'adds the combobox-input class' (a D3 class on the input; Maid's input has no such class)
  // n/a: 'adds combobox under container' (D3 appends the list under the container; Maid's list is
  //      a floating portal, placed by floating-ui)

  it('filters entries to those matching the value', () => {
    // the matches keep the options' order (no ranking)
    const shown = filterOptions(data, 'b').map((option) => option.label)
    expect(shown).toEqual(['foobar', 'bar', 'Baz'])
  })

  it('shows all entries when activating the combo', () => {
    const state = comboArrow({ options: data }, comboStart('foobar'), 1)
    expect(comboList({ options: data }, state)).toHaveLength(5)
    expect(state.text).toBe('foobar')
  })

  it('selects the first option that matches the input', () => {
    const env = { options: data }
    expect(comboPicked(env, typed('b', env))?.label).toBe('bar')
  })

  it('prefers an option that exactly matches the input over the first option', () => {
    const env = { options: data }
    const state = typed('foo', env)
    expect(comboPicked(env, state)?.label).toBe('foo') // skip foobar
    expect(state.completion).toBeUndefined()
  })

  it('does not autocomplete numeric options', () => {
    const numeric: FieldOption[] = [
      { value: '100', label: '100' },
      { value: '110', label: '110' },
    ]
    const env = { options: numeric }
    const state = typed('10', env)
    expect(comboPicked(env, state)).toBeUndefined()
    expect(state.text).toBe('10')
  })

  it('does not autocomplete if canAutocomplete(false)', () => {
    // Maid: the `autoComplete: false` option of the keys
    const env = { options: data, autoComplete: false }
    const state = typed('b', env)
    expect(state.text).toBe('b')
    expect(comboPicked(env, state)).toBeUndefined()
  })

  it('selects the completed portion of the value', () => {
    const state = typed('b')
    expect(state.text).toBe('bar')
    expect(state.completion).toEqual({ start: 1, end: 3 })
  })

  it('does not preserve the case of the input portion of the value by default', () => {
    const state = typed('B')
    expect(state.text).toBe('bar')
    expect(state.completion).toEqual({ start: 1, end: 3 })
  })

  it('does preserve the case of the input portion of the value with caseSensitive option', () => {
    const state = typed('B', { options: data, caseSensitive: true })
    expect(state.text).toBe('Baz')
    expect(state.completion).toEqual({ start: 1, end: 3 })
  })

  it('does not select when value is empty', () => {
    const state = comboType({ options: data }, comboStart(''), '', true)
    expect(state.completion).toBeUndefined()
    expect(state.active).toBe(-1)
  })

  it('does not select when value is not a prefix of any suggestion', () => {
    const env = { options: data }
    const state = typed('bi', env)
    expect(comboPicked(env, state)).toBeUndefined()
    expect(state.text).toBe('bi')
  })

  it('does not select or autocomplete after ⌫', () => {
    const env = { options: data }
    // the completion 'ar' is selected: Backspace removes it, leaving the typed 'b'
    const removed = comboDelete(typed('b', env))
    expect(removed.handled).toBe(true)
    expect(removed.state.text).toBe('b')
    expect(comboPicked(env, removed.state)).toBeUndefined()
  })

  it('does not select or autocomplete after ⌦', () => {
    const env = { options: data }
    let state = typed('fb', env)
    state = comboDelete(state).state
    state = comboType(env, state, 'b', true)
    expect(state.text).toBe('b')
    expect(comboPicked(env, state)).toBeUndefined()
  })

  it('selects and autocompletes the next/prev suggestion on ↓/↑', () => {
    const env = { options: data }
    let state = comboArrow(env, comboStart(''), 1)
    expect(comboPicked(env, state)?.label).toBe('foobar')
    expect(state.text).toBe('foobar')

    state = comboArrow(env, state, 1)
    expect(comboPicked(env, state)?.label).toBe('foo')
    expect(state.text).toBe('foo')

    state = comboArrow(env, state, -1)
    expect(comboPicked(env, state)?.label).toBe('foobar')
    expect(state.text).toBe('foobar')
  })

  it('emits accepted event with selected datum on ⇥', () => {
    const env = { options: data }
    const state = typed('b', env)
    expect(comboPicked(env, state)?.label).toBe('bar')
    expect(comboTab(env, state).state.text).toBe('bar')
  })

  it('emits accepted event with selected datum on ↩', () => {
    const env = { options: data }
    const result = comboEnter(env, typed('b', env))
    expect(result.state.text).toBe('bar')
    expect(result.commit).toBe(true)
  })

  it('emits cancel event on ⎋', () => {
    // Maid: Escape restores the text from before typing; the caller stops the key from reaching the editor
    const state = comboEscape(typed('ba'), 'Bahnhof')
    expect(state.text).toBe('Bahnhof')
    expect(state.completion).toBeUndefined()
  })

  it('hides on ↩', () => {
    const env = { options: data }
    expect(comboEnter(env, typed('b', env)).state.open).toBe(false)
  })
})
