// Adopted from iD test/spec/ui/sections/raw_tag_editor.js (ISC, © iD contributors), at commit 0194f3926.
//
// Maid's raw tag list is the Tags sheet: TagSheet (packages/ui/src/sheet/tags/TagSheet.tsx) over the
// adapter in packages/ui/src/sheet/tags/tags.ts. The adapter's rules are pure and tested there; each
// case below names the test that covers it. A case that needs the rendered grid stays todo.
import { describe, it } from 'bun:test'

describe('iD.uiSectionRawTagEditor', () => {
  // creates input elements for each key-value pair: packages/ui/src/sheet/tags/tags.test.ts "rowsFromTags: one row per tag"
  // adds pair of empty input elements at end of list: packages/ui/src/sheet/tags/tags.test.ts "a key and a value from the trailing row add a tag at the end, in one step"
  // removes tags when clicking the remove button: packages/ui/src/sheet/tags/tags.test.ts "removing a row removes its tag" and "clearing a key removes the tag and the row" (the sheet has no remove button)

  // Needs the rendered grid: the empty pair is the sheet's trailing row, drawn by Sheet.tsx. No browser check covers a feature without tags yet.
  it.todo('creates a pair of empty input elements if the entity has no tags', () => {})
})
