// Adopted from iD test/spec/validations/mismatched_geometry.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, it } from 'bun:test'

// Parked: the rule matches tags against the presets for a geometry (iD's presetManager.matchTags
// with 'line', 'area', 'point' and 'vertex'), and a rule cannot ask the presets: RuleContext has no
// presets, and packages/validation depends only on maid-model. See F-validations-23. The fixes
// also need preset-driven actions (connect the ends, remove the area tag, extract the point).

describe('iD.validations.mismatched_geometry', () => {
  // needs F-validations-23
  it.todo('has no errors on init', () => {})

  // needs F-validations-23
  it.todo('ignores points', () => {})

  // needs F-validations-23
  it.todo('ignores open way without area tag', () => {})

  // needs F-validations-23
  it.todo('ignores closed way with area tag', () => {})

  // needs F-validations-23
  it.todo('ignores open way with tag that allows both lines and areas', () => {})

  // needs F-validations-23
  it.todo('flags open way with area tag, and has autofix to connect the ends', () => {})

  // needs F-validations-23
  it.todo('flags open way with area tag, and has autofix to remove the area tag', () => {})

  // needs F-validations-23
  it.todo('flags open way with both area and line tags', () => {})

  // needs F-validations-23
  it.todo('handles presets which only allow vertex, not point', () => {})

  // needs F-validations-23
  it.todo('handles points which should be a vertex or line', () => {})

  // needs F-validations-23
  it.todo('handles vertices which should be a point', () => {})

  // needs F-validations-23
  it.todo('handles closed lines which should be a vertex or area', () => {})

  // needs F-validations-23
  it.todo('does not flag cases whether the entity matches the generic preset, regardless of geometry', () => {})

  // needs F-validations-23
  it.todo('does not error if the best preset is limited to certain regions', () => {})
})
