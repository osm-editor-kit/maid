// Adopted from iD test/spec/ui/fields/localized.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's localized field is driven through its DOM rows. Maid's localized-logic.ts gives the same
// answers: languageVariants lists the translations, commitLanguageRow decides what a row writes.
// iD types language names ('Deutsch', 'English'); Maid takes language codes only (F-ui-9).
import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { commitLanguageRow, languageVariants } from './localized-logic.ts'

const name: Field = {
  id: 'name',
  type: 'localized',
  key: 'name',
  label: 'Name',
  options: [],
  universal: true,
}

describe('iD.uiFieldLocalized', () => {
  it.todo('adds a blank set of fields when the + button is clicked', () => {}) // needs F-ui-8

  it.todo("doesn't create a tag when the value is empty", () => {}) // needs F-ui-9

  it("doesn't create a tag when the name is empty", () => {
    // a row with a value and no language waits for its language: nothing is written
    expect(commitLanguageRow({ base: 'name', tags: {}, code: '', value: 'Value' })).toEqual({
      kind: 'wait',
    })
  })

  it.todo('creates a tag after setting language then value', () => {}) // needs F-ui-9

  it.todo('creates a tag after setting value then language', () => {}) // needs F-ui-9

  it.todo('changes an existing language', () => {}) // needs F-ui-9

  it('ignores similar keys like `old_name`', () => {
    expect(languageVariants(name, { 'old_name:de': 'Value' })).toEqual([])
  })

  it.todo('removes the tag when the language is emptied', () => {}) // needs F-ui-10

  it('removes the tag when the value is emptied', () => {
    expect(
      commitLanguageRow({
        base: 'name',
        tags: { 'name:de': 'Value' },
        tagKey: 'name:de',
        code: 'de',
        value: '',
      }),
    ).toEqual({ kind: 'write', edits: [{ key: 'name:de', value: undefined }] })
  })

  // Maid's value input has no lang attribute yet. languageVariants gives the code it would be set
  // from ('de' here), so only the attribute is missing.
  it.todo('has a lang attribute on an existing multilingual name field', () => {}) // needs F-ui-20
})
