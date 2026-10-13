import type { Field, FieldOption } from '@osm-editor-kit/maid-presets'
import { cleanValue } from '../logic.ts'

/** The fields a combo reads: its type, its options and the spelling and list flags. */
export type ComboSpec = Pick<
  Field,
  'type' | 'options' | 'snakeCase' | 'caseSensitive' | 'customValues'
>

/**
 * What a typed text does on commit: the value to write (undefined removes the tag), or
 * 'refused' when the field allows only its listed options and the text is none of them. A
 * refused text leaves the value as it was.
 */
export type ComboWrite = { value: string | undefined } | 'refused'

/**
 * The text a combo shows for a value. An option's label when the value is listed; otherwise the
 * raw value, which the caller shows in italics. A typeCombo's `yes` shows as empty (as in iD).
 */
export function shownText(field: Pick<Field, 'type' | 'options'>, value: string | undefined) {
  if (value === undefined || value === '') return { text: '', raw: false }
  const option = field.options.find((candidate) => candidate.value === value)
  if (option) return { text: option.label, raw: false }
  if (field.type === 'typeCombo' && value.toLowerCase() === 'yes') return { text: '', raw: false }
  return { text: value, raw: true }
}

/** The option whose label equals the text, case-insensitively. The first one wins. */
export function matchLabel(options: readonly FieldOption[], text: string) {
  const wanted = text.trim().toLowerCase()
  if (wanted === '') return undefined
  return options.find((option) => option.label.trim().toLowerCase() === wanted)
}

/**
 * The options that match what is typed, for the list. Empty text lists every option. Otherwise an
 * option matches when its label or its value contains the text (case-insensitively, and a space
 * in the text also matches an underscore in the value). Label prefix matches come first; the
 * order inside each group is the options' order.
 */
export function filterOptions(options: readonly FieldOption[], text: string) {
  const query = text.trim().toLowerCase()
  if (query === '') return [...options]
  const underscored = query.replace(/ /g, '_')
  const ranked: { option: FieldOption; rank: number }[] = []
  for (const option of options) {
    const label = option.label.toLowerCase()
    const value = option.value.toLowerCase()
    if (label.startsWith(query)) ranked.push({ option, rank: 0 })
    else if (label.includes(query) || value.includes(query) || value.includes(underscored))
      ranked.push({ option, rank: 1 })
  }
  return ranked.sort((a, b) => a.rank - b.rank).map((entry) => entry.option)
}

/**
 * The tag value for a text that was typed and committed, as iD's tagValue:
 * - a text equal to an option's label (case-insensitive) writes that option's value;
 * - with customValues false, any other text is refused (also an empty one);
 * - an empty text removes the tag, or writes `yes` for a typeCombo;
 * - otherwise the text is cleaned, spaces become `_` unless snakeCase is false, and it is
 *   lower-cased unless caseSensitive is true.
 */
export function valueFromText(field: ComboSpec, text: string): ComboWrite {
  const cleaned = cleanValue(text)
  if (cleaned !== undefined) {
    const option = matchLabel(field.options, cleaned)
    if (option) return { value: option.value }
  }
  if (field.customValues === false) return 'refused'
  if (cleaned === undefined) return { value: field.type === 'typeCombo' ? 'yes' : undefined }
  return { value: spell(field, cleaned) }
}

/** iD's restrictTagValueSpelling, then cleaned again (lower-casing can lengthen a text). */
function spell(field: ComboSpec, text: string) {
  let value = text
  if (field.snakeCase !== false) value = value.replace(/ /g, '_')
  if (field.caseSensitive !== true) value = value.toLowerCase()
  return cleanValue(value)
}
