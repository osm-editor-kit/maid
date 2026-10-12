// Adopted from iD test/spec/ui/fields/radio.ts (ISC, © iD contributors), at commit 0194f3926.
//
// The iD spec also has an it.each over structureRadio that the inventory does not count (it counts
// only plain it( calls). It is adopted below as well, as its own test.
import { describe, expect, it } from 'bun:test'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { TagEdit } from '../logic.ts'
import { radioOptions, radioWrite } from './radio-logic.ts'

/** Applies edits to tags as the entity editor does: an undefined value removes the key. */
function apply(tags: Tags, edits: TagEdit[]): Tags {
  const next: Tags = { ...tags }
  for (const edit of edits) {
    if (edit.value === undefined) delete next[edit.key]
    else next[edit.key] = edit.value
  }
  return next
}

describe('iD.uiFieldRadio', () => {
  describe('structureRadio', () => {
    const structure: Field = {
      id: 'a',
      type: 'structureRadio',
      label: 'Structure',
      keys: ['bridge', 'tunnel'],
      options: [],
      universal: false,
    }

    it.each<[fromTags: Tags, optionToClick: string, toTags: Tags]>([
      [
        // if no tags, it should add layer=1
        {},
        'bridge',
        { bridge: 'yes', layer: '1' },
      ],
      [
        // existing positive layer should be respected
        { layer: '2' },
        'bridge',
        { bridge: 'yes', layer: '2' },
      ],
      [
        // negative layers are overridden with layer=1
        { layer: '-3' },
        'bridge',
        { bridge: 'yes', layer: '1' },
      ],
      [
        // changing a tunnel to a bridge should change layer
        { layer: '-1', tunnel: 'yes' },
        'bridge',
        { bridge: 'yes', layer: '1' },
      ],
      [
        // opposite direction: changing to a tunnel:
        { layer: '-3' },
        'tunnel',
        { tunnel: 'yes', layer: '-3' },
      ],
    ])(
      'given %s, after clicking on ‘%s’, changes tags to %s',
      (fromTags, optionToClick, toTags) => {
        // confirm that bridge+tunnel buttons are displayed
        expect(radioOptions(structure).map((option) => option.label)).toEqual(['bridge', 'tunnel'])
        // click one of the radio button
        const after = apply(fromTags, radioWrite(structure, fromTags, optionToClick))
        expect(after).toEqual(toTags)
      },
    )
  })

  describe('radio with strings.options', () => {
    it('renders option labels from .title when the field has nested title/description option strings', () => {
      // iD reads the titles from strings.options; Maid's options carry the label directly
      const field: Field = {
        id: 'access',
        type: 'radio',
        key: 'access',
        label: 'Access',
        options: [
          { value: 'yes', label: 'Allowed' },
          { value: 'no', label: 'Prohibited' },
        ],
        universal: false,
      }
      expect(radioOptions(field).map((option) => option.label)).toEqual(['Allowed', 'Prohibited'])
    })
  })
})
