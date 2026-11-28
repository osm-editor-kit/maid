/**
 * The tagging schema's translation file of a language, for `PresetData.localized`. Each file is a chunk of its own
 * (about 100 kB gzipped), fetched only for its language. English and a language Maid has no file for give
 * undefined: the English file is part of the presets' data (default.ts). Language variants (`de-CH`) are not read.
 */
export function loadPresetTranslations(locale: string): Promise<unknown> {
  switch (locale) {
    case 'de':
      return import('@openstreetmap/id-tagging-schema/dist/translations/de.min.json').then(
        (file) => file.default,
      )
    case 'fr':
      return import('@openstreetmap/id-tagging-schema/dist/translations/fr.min.json').then(
        (file) => file.default,
      )
    case 'es':
      return import('@openstreetmap/id-tagging-schema/dist/translations/es.min.json').then(
        (file) => file.default,
      )
    default:
      return Promise.resolve(undefined)
  }
}
