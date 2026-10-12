// Adopted from iD test/spec/validations/suspicious_name.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

// Parked: the rule flags a name that is generic (name-suggestion-index's generic and exclude
// patterns, and iD's services.nsi.isGenericName), that is a defining tag key or value, or that is
// the name of a preset (its name and aliases, in the language of the user). That needs the NSI data
// and the translated preset names, which packages/validation does not have. See F-validations-26.

describe('iD.validations.suspicious_name', () => {
  // needs F-validations-26
  it.todo('has no errors on init', () => {})

  // needs F-validations-26
  it.todo('ignores way with no tags', () => {})

  // needs F-validations-26
  it.todo('ignores feature with no name', () => {})

  // needs F-validations-26
  it.todo('ignores feature with a specific name', () => {})

  // needs F-validations-26
  it.todo('ignores feature with a specific name that includes a generic name', () => {})

  // needs F-validations-26
  it.todo('ignores feature matching excludeNamed pattern in name-suggestion-index', () => {})

  // needs F-validations-26
  it.todo('flags feature matching a excludeGeneric pattern in name-suggestion-index', () => {})

  // needs F-validations-26
  it.todo('flags feature matching a global exclude pattern in name-suggestion-index', () => {})

  // needs F-validations-26
  it.todo('flags feature with a name that is just a defining tag key', () => {})

  // needs F-validations-26
  it.todo('flags feature with a name that is just a defining tag value', () => {})

  // needs F-validations-26
  it.todo('flags feature with a name that matches the preset name', () => {})

  // needs F-validations-26
  it.todo('flags feature with a name that matches a preset alias', () => {})

  // needs F-validations-26
  it.todo('flags feature with a name that matches the preset name and tag name', () => {})

  // needs F-validations-26
  it.todo("ignores feature with a name that matches an ignored preset's name", () => {})
})
