// Adopted from iD test/spec/validations/outdated_tags.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

// Parked. The plain deprecated tags (the tests "flags deprecated tag ..." and "ignores ...") need
// the deprecated list of @openstreetmap/id-tagging-schema (dist/deprecated.json, present in
// packages/presets/node_modules) given to a rule factory, and iD's getDeprecatedTags. NSI brand
// suggestions need the name-suggestion-index, and the incomplete-tag tests need the preset's
// replacement. See F-validations-24 and F-validations-25.

describe('iD.validations.outdated_tags', () => {
  // needs F-validations-24
  it.todo('has no errors on init', () => {})

  // needs F-validations-24
  it.todo('has no errors on good tags', () => {})

  // needs F-validations-24
  it.todo('flags deprecated tag with replacement', () => {})

  // needs F-validations-24
  it.todo('flags deprecated tag with no replacement', () => {})

  // needs F-validations-24
  it.todo('flags deprecated tag with transfer replacement', () => {})

  // needs F-validations-24
  it.todo('flags deprecated tag with multiple transfer tags', () => {})

  // needs F-validations-24
  it.todo('ignores way with no relations', () => {})

  // needs F-validations-24
  it.todo('ignores multipolygon tagged on the relation', () => {})

  // needs F-validations-25
  it.todo('flags suggestions from NSI', () => {})

  // needs F-validations-25
  it.todo('generates 2 separate issues for deprecated tags and NSI suggestions', () => {})

  // needs F-validations-24
  it.todo('includes unchanged context tags of deprecation rule in tag reference', () => {})

  // needs F-validations-24
  it.todo('does not raise an error in valid situations', () => {})

  // needs F-validations-25
  it.todo('generates 2 separate issues for incomplete tags and NSI suggestions', () => {})
})
