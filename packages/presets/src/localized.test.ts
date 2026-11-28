import { describe, expect, it } from 'bun:test'
import { withChanges } from './changes.ts'
import { defaultPresetData } from './default.ts'
import { createPresets } from './presets.ts'
import { loadPresetTranslations } from './translations.ts'

// Expected German texts were read from id-tagging-schema 7.3.0, dist/translations/de.min.json.
const de = await loadPresetTranslations('de')
const german = createPresets({ ...defaultPresetData, localized: de })

function field(id: string) {
  const found = german.field(id)
  if (!found) throw new Error(`no field ${id}`)
  return found
}

describe('localized texts', () => {
  it('loads a file for de, fr and es, none for en or an unknown language', async () => {
    expect(de).toBeDefined()
    expect(await loadPresetTranslations('fr')).toBeDefined()
    expect(await loadPresetTranslations('es')).toBeDefined()
    expect(await loadPresetTranslations('en')).toBeUndefined()
    expect(await loadPresetTranslations('xx')).toBeUndefined()
  })

  it('shows preset names, field labels and option labels in the shown language', () => {
    expect(german.preset('highway/cycleway')?.name).toBe('Radweg')
    expect(field('structure').label).toBe('Struktur')
    expect(field('structure').options.find((option) => option.value === 'bridge')?.label).toBe(
      'Brücke',
    )
    expect(field('width').label).toBe('Breite (Meter)')
  })

  it('finds a preset by its name in the shown language', () => {
    expect(german.search('Radweg', 'line').map((preset) => preset.id)).toContain('highway/cycleway')
  })

  it('names a category in the shown language', () => {
    const landuse = german.defaults(['area']).find((row) => row.id === 'category-landuse')
    expect(landuse?.name).toBe('Flächennutzung')
  })

  it('falls back to English for a text the language lacks', () => {
    const partial = createPresets({
      ...defaultPresetData,
      localized: { de: { presets: { fields: { width: { label: 'Breite (Meter)' } } } } },
    })
    expect(partial.field('width')?.label).toBe('Breite (Meter)')
    expect(partial.field('structure')?.label).toBe('Structure')
    expect(partial.preset('highway/cycleway')?.name).toBe('Cycle Path')
  })

  it('shows the English text of what a change replaces, not the translation of the replaced text', () => {
    const changed = createPresets(
      withChanges(
        { ...defaultPresetData, localized: de },
        {
          fields: { width: { type: 'number', key: 'width', label: 'Own width' } },
          presetEdits: { 'highway/cycleway': { name: 'Own cycleway' } },
        },
      ),
    )
    expect(changed.field('width')?.label).toBe('Own width')
    expect(changed.preset('highway/cycleway')?.name).toBe('Own cycleway')
    expect(changed.field('structure')?.label).toBe('Struktur')
  })
})
