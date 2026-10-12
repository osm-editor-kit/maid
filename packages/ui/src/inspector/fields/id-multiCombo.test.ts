// Adopted from iD test/spec/ui/multiCombo.ts (ISC, © iD contributors), at commit 0194f3926.
//
// iD checks the field's "modified" marker, its revert (undo) icon and its remove icon through the
// DOM. Maid's buttons call the same decisions as logic.ts: isModified, revertEdits and removeEdits.
// Each iD test applies the edits to the entity's tags the way the entity editor does, and compares
// the resulting tags with iD's expected tags.
import { describe, expect, it } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { TagEdit } from '../logic.ts'
import { isModified, removeEdits, revertEdits } from '../logic.ts'

/** The field of the iD spec: a multiCombo over the key `fuel:`, with no option list. */
const fuel: Field = {
  id: 'fuel',
  type: 'multiCombo',
  key: 'fuel:',
  label: 'Fuel',
  options: [],
  universal: false,
}

/** Applies edits to tags as the entity editor does: an undefined value removes the key. */
function apply(tags: Tags, edits: TagEdit[]): Tags {
  const next: Tags = { ...tags }
  for (const edit of edits) {
    if (edit.value === undefined) delete next[edit.key]
    else next[edit.key] = edit.value
  }
  return next
}

describe('iD.uiField as multiCombo', () => {
  describe('modified', () => {
    const original: Tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no' }

    it('field is not marked modified when tags are original', () => {
      expect(isModified(fuel, { ...original }, original)).toBe(false)
    })

    it('marks field as modified when value is changed', () => {
      const newTags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'yes' }
      expect(isModified(fuel, newTags, original)).toBe(true)
    })

    it('marks field as modified when tag is changed', () => {
      const newTags = { 'fuel:HGV_diesel': 'yes', 'fuel:petrol': 'no' }
      expect(isModified(fuel, newTags, original)).toBe(true)
    })

    it('marks field as modified when existing tag is removed', () => {
      const newTags = { 'fuel:diesel': 'yes' }
      expect(isModified(fuel, newTags, original)).toBe(true)
    })

    it('marks field as modified when a new tag is added', () => {
      const newTags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', 'fuel:propane': 'yes' }
      expect(isModified(fuel, newTags, original)).toBe(true)
    })
  })

  describe('undo', () => {
    describe('relevant tags', () => {
      const original: Tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no' }

      it('undo reverts changed value', () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'yes' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
        })
      })

      it('undo reverts changed tag', () => {
        const tags = { 'fuel:HGV_diesel': 'yes', 'fuel:petrol': 'no' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
        })
      })

      it('undo reverts added tag', () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', 'fuel:propane': 'yes' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
        })
      })

      it('undo reverts removed tag', () => {
        const tags = { 'fuel:diesel': 'yes' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
        })
      })
    })

    describe('unrelated tags', () => {
      it("undo doesn't affect unrelated value change", () => {
        const original: Tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', existing: 'yes' }
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'yes', existing: 'no' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
          existing: 'no',
        })
      })

      it("undo doesn't affect unrelated tag addition", () => {
        const original: Tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no' }
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'yes', additional: 'yes' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
          additional: 'yes',
        })
      })

      it("undo doesn't affect unrelated tag removal", () => {
        const original: Tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', temporary: 'yes' }
        // `temporary` is removed
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'yes' }
        expect(apply(tags, revertEdits(fuel, tags, original))).toEqual({
          'fuel:diesel': 'yes',
          'fuel:petrol': 'no',
        })
      })
    })
  })

  describe('remove', () => {
    describe('relevant tags', () => {
      it('removes all field tags', () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({})
      })

      it('removes newly-added tags', () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', 'fuel:propane': 'yes' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({})
      })

      it('removes remaining tags when one was already removed', () => {
        const tags = { 'fuel:diesel': 'yes' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({})
      })
    })

    describe('unrelated tags', () => {
      it("remove doesn't affect unrelated existing tag", () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', existing: 'yes' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({ existing: 'yes' })
      })

      it("remove doesn't affect unrelated added tag", () => {
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no', additional: 'yes' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({ additional: 'yes' })
      })

      it("remove doesn't restore a previously removed unrelated tag", () => {
        // `temporary` was removed before the field's remove icon is clicked
        const tags = { 'fuel:diesel': 'yes', 'fuel:petrol': 'no' }
        expect(apply(tags, removeEdits(fuel, tags))).toEqual({})
      })
    })
  })
})
