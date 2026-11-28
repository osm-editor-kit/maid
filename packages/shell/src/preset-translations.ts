import { getLocale } from '@osm-editor-kit/maid-i18n'
import { loadPresetTranslations } from '@osm-editor-kit/maid-presets/translations'

/**
 * The tagging schema's texts in the app's language, for an app's presets (`PresetData.localized`): undefined in
 * English. Call it inside the `lazyPresets` factory, next to the presets' `import()`, so the two chunks load in
 * parallel; the language is set at mount, before the factory runs.
 */
export function presetTranslations(): Promise<unknown> {
  return loadPresetTranslations(getLocale())
}
