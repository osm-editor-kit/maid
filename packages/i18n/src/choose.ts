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

/** The `lang=` parameter of a page address, when it names a language Maid has */
function localeFromUrl(url: string): Locale | undefined {
  try {
    const value = new URL(url).searchParams.get('lang')
    return isLocale(value) ? value : undefined
  } catch {
    // not an address: nothing is named
    return undefined
  }
}

/**
 * The language of a visit, the first that names one: the `lang=` parameter of the address, the
 * choice stored in the settings, the browser's languages in their order (`de-CH` counts as `de`),
 * and the app's fallback (English if it has none). Pure: the caller reads the address, the storage and `navigator.languages`.
 */
export function chooseLocale(input: {
  url: string
  stored?: string | undefined
  browser?: readonly string[] | undefined
  /** The app's own default, used when the address, the stored choice and the browser name no language. Default English. */
  fallback?: Locale | undefined
}): Locale {
  const fromUrl = localeFromUrl(input.url)
  if (fromUrl) return fromUrl
  if (isLocale(input.stored)) return input.stored
  for (const tag of input.browser ?? []) {
    const base = tag.split('-')[0]?.toLowerCase()
    if (isLocale(base)) return base
  }
  return input.fallback ?? FALLBACK_LOCALE
}
