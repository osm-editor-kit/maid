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

/** A length on the ground in metres with one decimal, always: "3.0 m" in English, "3,0 m" in German */
export function formatMetres(metres: number) {
  const number = new Intl.NumberFormat(getLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(metres)
  return `${number} m`
}
