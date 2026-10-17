/**
 * The module's own texts (messages/*.json, compiled into paraglide/ by packages/i18n/scripts/compile.ts). `m.<id>(values?)`
 * gives the text in the app's language: the module's `getLocale` is linked to the app's here, once, before any
 * message is read (see linkModuleLocale in packages/i18n). Read a text when it is shown or made, never at module level.
 */
import { linkModuleLocale } from '@osm-editor-kit/maid-i18n'
import { getLocale, overwriteGetLocale } from '../paraglide/runtime.js'

linkModuleLocale(overwriteGetLocale)

export { m } from '../paraglide/messages.js'

/** A number in the app's language, with at most `digits` decimals (12.5 in English, 12,5 in German) */
export function formatNumber(value: number, digits = 1) {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: digits }).format(value)
}
