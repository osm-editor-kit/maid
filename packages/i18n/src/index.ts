/**
 * Maid's texts. Use `m.<message_id>(values?)` for a text and `setLocale` once at start (mount.tsx).
 * Message ids and the rules: README.md in this package. The generated folder `paraglide/` is written
 * by `scripts/compile.ts` and git-ignored; run `bun run i18n-compile` (or any check or dev script).
 */
export { LANGUAGE_NAMES, LOCALES, chooseLocale, isLocale, type Locale } from './choose.ts'
export { m } from '../paraglide/messages.js'
export { setLocale } from './strategy.ts'
export { getLocale, locales } from '../paraglide/runtime.js'
