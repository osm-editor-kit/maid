// Adopted from iD test/spec/ui/combobox.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's combobox is a D3 widget that completes the typed text inline. Maid's Combo.tsx shows a
// filtered list (filterOptions, combo-logic.ts) and writes the text on blur. The inline completion,
// the highlight on the first match and the keys that accept or cancel are not built or not in a
// pure function yet, so most of these tests are todos with the feature that is missing.
import { describe, it } from 'bun:test'

describe('uiCombobox', () => {
  // n/a: 'adds the combobox-input class' (a D3 class on the input; Maid's input has no such class)
  // n/a: 'adds combobox under container' (D3 appends the list under the container; Maid's list is
  //      a floating portal, placed by floating-ui)

  it.todo('filters entries to those matching the value', () => {}) // needs F-ui-4

  it.todo('shows all entries when activating the combo', () => {}) // needs F-ui-3

  it.todo('selects the first option that matches the input', () => {}) // needs F-ui-1

  it.todo('prefers an option that exactly matches the input over the first option', () => {}) // needs F-ui-1

  it.todo('does not autocomplete numeric options', () => {}) // needs F-ui-1

  it.todo('does not autocomplete if canAutocomplete(false)', () => {}) // needs F-ui-1

  it.todo('selects the completed portion of the value', () => {}) // needs F-ui-1

  it.todo('does not preserve the case of the input portion of the value by default', () => {}) // needs F-ui-1

  it.todo('does preserve the case of the input portion of the value with caseSensitive option', () => {}) // needs F-ui-1

  it.todo('does not select when value is empty', () => {}) // needs F-ui-1

  it.todo('does not select when value is not a prefix of any suggestion', () => {}) // needs F-ui-1

  it.todo('does not select or autocomplete after ⌫', () => {}) // needs F-ui-1

  it.todo('does not select or autocomplete after ⌦', () => {}) // needs F-ui-1

  it.todo('selects and autocompletes the next/prev suggestion on ↓/↑', () => {}) // needs F-ui-1

  it.todo('emits accepted event with selected datum on ⇥', () => {}) // needs F-ui-1

  it.todo('emits accepted event with selected datum on ↩', () => {}) // needs F-ui-1

  it.todo('emits cancel event on ⎋', () => {}) // needs F-ui-2

  it.todo('hides on ↩', () => {}) // needs F-ui-2
})
