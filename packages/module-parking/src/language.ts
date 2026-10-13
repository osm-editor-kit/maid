/**
 * The language of the module's own texts. The shell sets the page's language before the editor is made (mount.tsx);
 * the module's texts are English or German until they move to packages/i18n. Where there is no page (the unit tests,
 * the config check) they are English.
 */
export function isGerman(): boolean {
  return (
    typeof document !== 'undefined' && document.documentElement.lang.toLowerCase().startsWith('de')
  )
}

/** The English text, or the German one when the page is in German */
export function pick<T>(en: T, de: T): T {
  return isGerman() ? de : en
}
