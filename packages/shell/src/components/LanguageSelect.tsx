import { getLocale, LANGUAGE_NAMES, LOCALES, isLocale, m } from '@osm-editor-kit/maid-i18n'
import { useSettings } from '@osm-editor-kit/maid-ui'

/**
 * The language as a native select in the account flyout, next to the theme. The choice is stored,
 * and the page reloads in that language (ADR 0009, decision 4). The `lang=` parameter is left out of
 * the reloaded address: it would win over the stored choice.
 */
export function LanguageSelect() {
  const setLang = useSettings((settings) => settings.setLang)
  return (
    <select
      aria-label={m.topbar_language()}
      value={getLocale()}
      onChange={(event) => {
        const next = event.target.value
        if (!isLocale(next)) return
        setLang(next)
        const url = new URL(location.href)
        url.searchParams.delete('lang')
        location.assign(url.href)
      }}
      className="cursor-pointer rounded-md bg-white py-1 pr-7 pl-2 text-sm text-zinc-950 ring-1 ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:text-white dark:ring-white/15"
    >
      {LOCALES.map((locale) => (
        <option key={locale} value={locale}>
          {LANGUAGE_NAMES[locale]}
        </option>
      ))}
    </select>
  )
}
