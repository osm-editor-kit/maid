// Adopted from iD test/spec/ui/sections/raw_tag_editor.js (ISC, © iD contributors), at commit 0194f3926.
//
// Maid's raw tag list is TagList.tsx with TagRow.tsx and AddTag.tsx. Its rules (sorting, the
// empty state, the add form, the remove button, the commit on blur) are written inside the
// components, not in a pure function, so none of them can be unit tested yet.
import { describe, it } from 'bun:test'

describe('iD.uiSectionRawTagEditor', () => {
  it.todo('creates input elements for each key-value pair', () => {}) // needs F-ui-18

  // iD expects a pair of empty inputs for an entity without tags. Maid shows "No tags" and the
  // add form (AddTag.tsx) instead: the same need, a different layout.
  it.todo('creates a pair of empty input elements if the entity has no tags', () => {}) // needs F-ui-18

  it.todo('adds pair of empty input elements at end of list', () => {}) // needs F-ui-18

  it.todo('removes tags when clicking the remove button', () => {}) // needs F-ui-18
})
