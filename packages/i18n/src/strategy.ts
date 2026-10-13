import {
  assertIsLocale,
  defineCustomClientStrategy,
  setLocale as setParaglideLocale,
  type Locale,
} from '../paraglide/runtime.js'

/**
 * The locale of this page, in memory. The compiled output is set up with the strategies
 * `custom-maid` and `baseLocale` (packages/i18n/package.json, `compile`), so Paraglide never writes
 * a cookie or localStorage itself: Maid's settings store keeps the choice (packages/ui/src/settings.ts),
 * and the shell applies it once at start (packages/shell/src/mount.tsx). Until then, English.
 */
let current: Locale | undefined

defineCustomClientStrategy('custom-maid', {
  getLocale: () => current,
  setLocale: (locale) => {
    current = assertIsLocale(locale)
  },
})

/**
 * Sets the language of every message from now on. Passes `reload: false`: a page that is already
 * drawn is not reloaded by this. A switch of language reloads the page on its own.
 */
export function setLocale(locale: Locale) {
  void setParaglideLocale(locale, { reload: false })
}
