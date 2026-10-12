// Adopted from iD test/spec/ui/entity_editor.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's entity editor re-matches the preset when the graph changes under a selected entity. Maid's
// Inspector reads the data through React state; the preset match itself is a pure function in
// packages/presets, but nothing checks that the inspector follows a change of the data.
import { describe, it } from 'bun:test'

describe('iD.uiEntityEditor', () => {
  it.todo('refreshes selected entity details when history merge fires', () => {}) // needs F-ui-16
})
