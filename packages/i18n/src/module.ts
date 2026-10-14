import { getLocale } from '../paraglide/runtime.js'

/**
 * Makes a module's own messages follow the app's language. A module keeps its texts in its own inlang project
 * (`packages/module-*\/project.inlang`, `messages/`), compiled by `scripts/compile.ts` into its own `paraglide/`.
 * Call this once, in the module's `messages.ts`, before any message is read:
 *
 *   import { overwriteGetLocale } from '../paraglide/runtime.js'
 *   import { linkModuleLocale } from '@osm-editor-kit/maid-i18n'
 *   linkModuleLocale(overwriteGetLocale)
 *   export { m } from '../paraglide/messages.js'
 *
 * The module's `getLocale` is replaced by the app's, so there is one language state: the shell sets it once, before
 * the first render (mount.tsx). Without a page (tests, the config check) the app answers English.
 */
export function linkModuleLocale<Locale extends string>(
  overwrite: (fn: () => Locale) => void,
): void {
  overwrite(() => getLocale() as Locale)
}
