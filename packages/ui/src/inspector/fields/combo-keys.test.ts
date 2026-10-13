import { describe, expect, it } from 'bun:test'
import type { FieldOption } from '@osm-editor-kit/maid-presets'
import {
  comboArrow,
  comboChoose,
  comboDelete,
  comboEnter,
  comboEscape,
  comboList,
  comboOpen,
  comboPicked,
  comboStart,
  comboType,
  type ComboKeyEnv,
  type ComboKeyState,
} from './combo-keys.ts'

// The iD cases are in id-combobox.test.ts; these are the rules Maid adds or chooses.

const data: FieldOption[] = [
  { value: 'foobar', label: 'foobar' },
  { value: 'foo', label: 'foo' },
  { value: 'bar', label: 'bar' },
  { value: 'Baz', label: 'Baz' },
  { value: 'test', label: 'test' },
]

const env: ComboKeyEnv = { options: data }

function typed(text: string, e: ComboKeyEnv = env): ComboKeyState {
  let state = comboStart('')
  for (const ch of text) {
    const prefix = state.completion ? state.text.slice(0, state.completion.start) : state.text
    state = comboType(e, state, prefix + ch, true)
  }
  return state
}

describe('combo keys (Maid rules)', () => {
  it('matches a label that is a value with spaces, through the underscore spelling', () => {
    const spaced: FieldOption[] = [{ value: 'residential_street', label: 'Residential street' }]
    const state = typed('res', { options: spaced })
    expect(comboPicked({ options: spaced }, state)?.label).toBe('Residential street')
  })

  it('completes an option by its value when the label is different', () => {
    const spaced: FieldOption[] = [{ value: 'residential_street', label: 'Residential street' }]
    const state = typed('residential_', { options: spaced })
    expect(state.text).toBe('residential_street')
    expect(comboPicked({ options: spaced }, state)?.label).toBe('Residential street')
  })

  it('an arrow does not complete: the text is the label, with no selection', () => {
    const state = comboArrow(env, comboStart('b'), 1)
    expect(state.completion).toBeUndefined()
    expect(state.text).toBe('foobar')
  })

  it('Enter accepts the highlighted option by its label, not the typed text', () => {
    const state = comboArrow(env, comboStart('b'), 1)
    expect(comboEnter(env, state).state.text).toBe('foobar')
    // the arrow moves on from a highlighted 'bar' to 'Baz' (the list of 'b' is foobar, bar, Baz)
    expect(comboArrow(env, typed('b'), 1).text).toBe('Baz')
  })

  it('a click on the field opens every option, after the text was typed', () => {
    const state = comboOpen(typed('b'))
    expect(comboList(env, state)).toHaveLength(5)
    expect(state.active).toBe(-1)
  })

  it('Escape closes the list and drops the highlight', () => {
    const state = comboEscape({ ...typed('b'), open: true }, 'bar')
    expect(state.open).toBe(false)
    expect(state.active).toBe(-1)
  })

  it('a click on an option closes the list with its label as the text', () => {
    const state = comboChoose(typed('b'), 'Baz')
    expect(state.text).toBe('Baz')
    expect(state.open).toBe(false)
    expect(state.query).toBeUndefined()
  })

  it('Backspace after the completion leaves the list open with the typed text', () => {
    const result = comboDelete(typed('b'))
    expect(result.handled).toBe(true)
    expect(result.state.text).toBe('b')
    expect(result.state.query).toBe('b')
  })

  it('an empty text closes the list (iD hides it on an empty value)', () => {
    const state = comboType(env, typed('b'), '', true)
    expect(state.open).toBe(false)
  })

  it('after a Backspace the next typing does not complete, and completing resumes', () => {
    // no completion here, so the browser removes the 'b' of 'fb' and the combo is told only that
    const deleted = comboDelete(typed('fb'))
    expect(deleted.handled).toBe(false)
    let state = comboType(env, deleted.state, 'f', true) // 'f' alone would complete foobar
    expect(state.text).toBe('f')
    expect(state.completion).toBeUndefined()
    state = comboType(env, state, 'fo', true)
    expect(state.text).toBe('foobar')
    expect(state.completion).toEqual({ start: 2, end: 6 })
  })
})
