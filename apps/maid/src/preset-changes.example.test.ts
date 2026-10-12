import { describe, expect, it } from 'bun:test'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData, defaultPresets } from '@osm-editor-kit/maid-presets/default'
import { examplePresetChanges } from './preset-changes.example.ts'

describe('examplePresetChanges', () => {
  const presets = createPresets(withChanges(defaultPresetData, examplePresetChanges))

  it('applies to the default data without an error', () => {
    expect(() => withChanges(defaultPresetData, examplePresetChanges)).not.toThrow()
  })

  it('shows the new fields on the presets it names, in the order it gives', () => {
    const cycleway = presets.preset('highway/cycleway')!
    const ids = presets
      .fieldsFor(cycleway, { highway: 'cycleway' }, 'line')
      .map((field) => field.id)
    expect(ids.indexOf('is_sidepath')).toBeLessThan(ids.indexOf('surface'))
    expect(ids.indexOf('surface_colour')).toBeGreaterThan(ids.indexOf('surface'))
    const colour = presets.field('surface_colour')
    expect(colour?.label).toBe('Surface Colour')
    expect(colour?.options.map((option) => option.label)).toEqual(['Not coloured', 'Red', 'Green'])
  })

  it('offers the check under "Add field" on footways', () => {
    const footway = presets.preset('highway/footway')!
    const more = presets
      .moreFieldsFor(footway, { highway: 'footway' }, 'line')
      .map((field) => field.id)
    expect(more).toContain('is_sidepath')
  })

  it('reorders the path fields as given', () => {
    const path = presets.preset('highway/path')!
    const ids = presets.fieldsFor(path, { highway: 'path' }, 'line').map((field) => field.id)
    expect(ids.slice(0, 3)).toEqual(['name', 'access', 'surface'])
  })

  it('hides the fuel station from search and still matches it', () => {
    expect(presets.search('gas station', 'point').map((preset) => preset.id)).not.toContain(
      'amenity/fuel',
    )
    expect(defaultPresets.search('gas station', 'point').map((preset) => preset.id)).toContain(
      'amenity/fuel',
    )
    expect(presets.match({ amenity: 'fuel' }, 'point').id).toBe('amenity/fuel')
  })

  it('is not switched on by default', () => {
    expect(
      defaultPresets
        .fieldsFor(defaultPresets.preset('highway/cycleway')!, { highway: 'cycleway' }, 'line')
        .map((field) => field.id),
    ).not.toContain('is_sidepath')
  })
})
