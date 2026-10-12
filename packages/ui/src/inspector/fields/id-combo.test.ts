// Adopted from iD test/spec/ui/fields/combo.ts (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test'
import type { Field } from '@osm-editor-kit/maid-presets'
import { addSemi, removeSemi, semiList, semiWrite } from './multi-logic.ts'

describe('iD.uiFieldCombo', () => {
  describe('semiCombo', () => {
    const destination: Field = {
      id: 'destination',
      type: 'semiCombo',
      key: 'destination',
      label: 'Destination',
      options: [],
      universal: false,
    }

    it.todo('filters out duplicates by default', () => {}) // needs F-ui-5

    // iD's field has allowDuplicates: true. Maid's Field has no such flag and keeps duplicates in
    // every list, so the expectation holds here without it.
    it('supports duplicates when allowDuplicates is true', () => {
      const tags = { 'destination:symbol': 'none;none;Jurong East;none;Māngere' }
      const values = semiList(tags['destination:symbol'])
      expect(values).toHaveLength(5)

      // click the remove button from the 4th value
      const after = removeSemi(values, 3)

      // the `none` value at the correct index was deleted
      expect({ 'destination:symbol': semiWrite(after) }).toEqual({
        'destination:symbol': 'none;none;Jurong East;Māngere',
      })
    })

    it('does not add duplicates if the only difference is whitespace', () => {
      // space before value
      const current = semiList('none; kirribilli')
      // add the same value again
      const after = addSemi(destination, current, 'kirribilli')

      // whitespace was trimmed, no duplicate
      expect({ destination: semiWrite(after) }).toEqual({ destination: 'none;kirribilli' })
    })
  })
})
