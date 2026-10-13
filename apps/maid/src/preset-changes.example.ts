/**
 * An example of changes to the default presets, in the spirit of a fork's customisation. Not used by default:
 * presets.ts has the lines that switch it on. See packages/presets/README.md, "Changing presets in a child app".
 */
import type { PresetChanges } from '@osm-editor-kit/maid-presets'

export const examplePresetChanges: PresetChanges = {
  fields: {
    // a new combo field: its English labels are given here, no translation file needed
    surface_colour: {
      type: 'combo',
      label: 'Surface Colour',
      key: 'surface:colour',
      geometry: ['line'],
      options: { no: 'Not coloured', red: 'Red', green: 'Green' },
    },
    // a new check field: yes, no or unset
    is_sidepath: {
      type: 'check',
      label: 'Along a Road (Sidepath)',
      key: 'is_sidepath',
      geometry: ['line'],
    },
  },
  presetEdits: {
    // both new fields go next to the surface, in this order
    'highway/cycleway': {
      addFields: [
        { id: 'is_sidepath', before: 'surface' },
        { id: 'surface_colour', after: 'surface' },
      ],
    },
    // the check is offered under "Add field" on footways
    'highway/footway': { addMoreFields: ['is_sidepath'] },
    // reorder: the access field moves up, behind the name
    'highway/path': {
      setFields: ['name', 'access', 'surface', 'width', 'structure', 'tunnel/name', 'incline'],
    },
    // not offered by search, but still matched when a fuel station is on the map
    'amenity/fuel': { hide: true },
  },
}
