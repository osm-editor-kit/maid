// The texts that come from @tilda-geo/bicycle-infrastructure-tagging (German and English): attribute names, notes,
// reminders, kinds and options of "Change to", reasons of a plan. French and Spanish get the English ones. Category
// names: German from the package (as tilda-geo shows them), the other languages from the module's messages.
import { getLocale } from '@osm-editor-kit/maid-i18n'
import { TILDA_LABELS, categoryLabel } from '@tilda-geo/bicycle-infrastructure-tagging'
import { m } from './messages.ts'

/** The language of the package's texts: German, or English for every other language */
export function packageLanguage(): 'de' | 'en' {
  return getLocale().startsWith('de') ? 'de' : 'en'
}

/** The name of a TILDA category, or "No category" */
export function categoryName(category: string | undefined) {
  if (!category) return m.tilda_no_category()
  const german = packageLanguage() === 'de' ? categoryLabel(category, TILDA_LABELS.de) : undefined
  if (german) return german
  const message = (m as unknown as Record<string, (() => string) | undefined>)[
    `tilda_category_${category}`
  ]
  return message ? message() : category
}

/** Category labels for the texts of a plan: German as TILDA shows them; English uses the ids */
export function planTextOptions() {
  return packageLanguage() === 'de' ? { categoryLabels: TILDA_LABELS.de } : {}
}

/** A value as TILDA names it (`oneway=implicit_yes` → „Eine Richtung (abgeleitet)“); German only */
export function tildaValueLabel(attributeId: string, value: string | undefined) {
  if (value === undefined || packageLanguage() !== 'de') return value
  const labels: Record<string, string> = TILDA_LABELS.de
  const label = labels[`${attributeId}=${value}`]
  return label ? `„${label}“` : value
}

/** OSM numbers take a decimal point: a typed `2,5` in a width key becomes `2.5` */
export function normalizeWidthInput(key: string, value: string) {
  const isWidth = !/^(source|note|check_date):/.test(key) && /(^|:)width(:|$)/.test(key)
  return isWidth ? value.replace(/(\d),(\d)/g, '$1.$2') : value
}
