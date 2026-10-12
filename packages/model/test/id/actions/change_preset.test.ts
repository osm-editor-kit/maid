// Adopted from iD test/spec/actions/change_preset.js (ISC, © iD contributors), at commit 0194f3926.
// Every test needs presets, which the model does not have (Rapid leaves change_preset out). They are parked as F-actions-a-4.
import { describe, it } from 'bun:test';

describe('iD.actionChangePreset', () => {
  // needs F-actions-a-4
  it.todo('changes from one preset\'s tags to another\'s');
  // needs F-actions-a-4
  it.todo('adds the tags of a new preset to an entity without an old preset');
  // needs F-actions-a-4
  it.todo('removes the tags of an old preset from an entity without a new preset');
  // needs F-actions-a-4
  it.todo('preserves the tags that are defined in neither preset when changing from one preset to another');
  // needs F-actions-a-4
  it.todo('preserves the tags of a new preset\'s addTags');
  // needs F-actions-a-4
  it.todo('preserves the tags when there is a matching field in the new preset');
  // needs F-actions-a-4
  it.todo('does not preserves the tags of a non-matching field in the new preset');
  // needs F-actions-a-4
  it.todo('does not preserve field tags which only exist in the old preset, not in the new preset');
  // needs F-actions-a-4
  it.todo('preserves all tags when re-selecting the same preset');
  // needs F-actions-a-4
  it.todo('does not preserve $fieldType field tags that are only present in the old preset');
  // needs F-actions-a-4
  it.todo('preserve $fieldType field tags when they are present in the old and the new preset');
  // needs F-actions-a-4
  it.todo('preserves tags of the old preset when selecting a new preset with a field for the old preset\'s primary tag');
  // needs F-actions-a-4
  it.todo('does not preserve old preset\'s primary tags when changing from a subpreset to its parent');
});
