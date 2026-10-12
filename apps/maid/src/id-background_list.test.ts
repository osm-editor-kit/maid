// Adopted from iD test/spec/ui/sections/background_list.js (ISC, © iD contributors), at commit 0194f3926.
//
// iD's background list lets the user add a custom imagery source with a template, and checks that
// a missing source does not crash it. Maid has no custom imagery source: its imagery is the ELI
// listing (packages/module-imagery), whose sorting and search are tested in helpers.test.ts, which
// iD's spec does not cover.
import { describe, it } from 'bun:test'

describe('iD.uiSectionBackgroundList', () => {
  it.todo('does not crash during initialization if custom source is missing', () => {}) // needs F-ui-17

  it.todo('customChanged handles missing custom source gracefully', () => {}) // needs F-ui-17

  it.todo('customChanged fallback to "none" handles missing "none" source gracefully', () => {}) // needs F-ui-17
})
