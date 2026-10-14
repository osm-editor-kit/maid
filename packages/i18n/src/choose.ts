/**
 * The languages Maid has, in the order they are offered. The message files in `messages/` and the
 * compiled locales must list the same ones (locales.test.ts checks it).
 */
export const LOCALES = ['en', 'de', 'fr', 'es'] as const

export type Locale = (typeof LOCALES)[number]

/** Each language's name in that language, for the language switch */
export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
}

/** The language that is used when nothing else names one */
export const FALLBACK_LOCALE: Locale = 'en'

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value)
}

/**
 * The language of a visit, the first that names one: the `lang` parameter of the address (already read by the
 * shell's URL parameters, so a value that is not one of Maid's is `null` or `undefined` here), the choice stored
 * in the settings, the browser's languages in their order (`de-CH` counts as `de`), and the app's fallback
 * (English if it has none). Pure: the caller reads the address, the storage and `navigator.languages`.
 */
export function chooseLocale(input: {
  /** The URL's `lang` parameter, as the shell reads it: a language Maid has, or nothing */
  lang?: string | null | undefined
  stored?: string | undefined
  browser?: readonly string[] | undefined
  /** The app's own default, used when the address, the stored choice and the browser name no language. Default English. */
  fallback?: Locale | undefined
}): Locale {
  if (isLocale(input.lang)) return input.lang
  if (isLocale(input.stored)) return input.stored
  for (const tag of input.browser ?? []) {
    const base = tag.split('-')[0]?.toLowerCase()
    if (isLocale(base)) return base
  }
  return input.fallback ?? FALLBACK_LOCALE
}
