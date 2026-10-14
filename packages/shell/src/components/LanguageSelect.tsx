import { getLocale, LANGUAGE_NAMES, LOCALES, isLocale, m } from '@osm-editor-kit/maid-i18n'
import { useSettingsActions } from '@osm-editor-kit/maid-ui'

/**
 * The language as a native select in the account flyout, next to the theme. The choice is stored as the default for
 * the next visit, and the address gets the same `lang` before the page reloads in that language (ADR 0009, decision 4).
 * An old `lang` in the address would win over the stored choice on the reload, so it is replaced, not kept: the
 * address and the stored choice agree.
 */
export function LanguageSelect() {
  const { setLang } = useSettingsActions()
  return (
    <select
      aria-label={m.topbar_language()}
      value={getLocale()}
      onChange={(event) => {
        const next = event.target.value
        if (!isLocale(next)) return
        setLang(next)
        const url = new URL(location.href)
        url.searchParams.set('lang', next)
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
