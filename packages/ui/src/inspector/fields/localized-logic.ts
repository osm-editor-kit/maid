import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { cleanValue, fieldKeys, type TagEdit } from '../logic.ts'

/** A translation of a localized field: its tag (name:de), its language code (de) and its value. */
export type LanguageVariant = { tagKey: string; code: string; value: string }

/**
 * What a row's commit does (see commitLanguageRow):
 * - write: the edits to make (possibly none, when nothing changed);
 * - wait: a row being added is not complete yet (it needs a code and a value); it stays;
 * - discard: a row being added is empty and is dropped;
 * - error: the text is refused, with the reason to show; nothing is written.
 */
export type LanguageCommit =
  | { kind: 'write'; edits: TagEdit[] }
  | { kind: 'wait' }
  | { kind: 'discard' }
  | { kind: 'error'; message: string }

function nonEmpty(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/**
 * The translations of a localized field, by code. A key is a translation when fieldKeys (logic.ts)
 * says it belongs to the field: `name:de` and `name:zh-Hans` are, `name:etymology`, `name:left`
 * and `name:source` are not. Empty values are not shown.
 */
export function languageVariants(field: Field, tags: Tags) {
  const base = field.key
  if (base === undefined) return []
  return fieldKeys(field, tags)
    .filter((tagKey) => tagKey.startsWith(`${base}:`) && nonEmpty(tags[tagKey]))
    .map((tagKey) => ({
      tagKey,
      code: tagKey.slice(base.length + 1),
      value: tags[tagKey] ?? '',
    }))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}

/**
 * A language code as a person types it: a language of two or three letters, then optionally a
 * script of four letters and a region of two letters or three digits (iD's LANGUAGE_SUFFIX_REGEX
 * without variants). The language is lower case, the script title case, the region upper case:
 * `DE` is `de`, `pt-br` is `pt-BR`, `zh_hant_tw` is `zh-Hant-TW`. Undefined when the text is not
 * a code. A code without a script or region is still a code: `left` is refused (four letters).
 */
export function normalizeLanguageCode(text: string) {
  const match = /^([A-Za-z]{2,3})(?:[-_]([A-Za-z]{4}))?(?:[-_]([A-Za-z]{2}|[0-9]{3}))?$/.exec(
    text.trim(),
  )
  if (!match) return undefined
  const [, language = '', script, region] = match
  let code = language.toLowerCase()
  if (script !== undefined)
    code += `-${script.charAt(0).toUpperCase()}${script.slice(1).toLowerCase()}`
  if (region !== undefined) code += `-${region.toUpperCase()}`
  return code
}

/**
 * What a row's commit writes. The row has a code and a value, both typed:
 * - `tagKey` is the translation's tag, undefined for a row being added;
 * - an empty code is an error for a translation (remove it with the cross instead); a row being
 *   added with both code and value empty is discarded, and one with only the code or only the
 *   value waits for the other;
 * - a code that is not a code is an error, and so is a code whose tag already has a value;
 * - a changed code renames the tag: the old key is removed and the new one holds the value;
 * - an empty value removes the tag (cleanValue, as the other text fields).
 * Only keys whose value changes are in the edits.
 */
export function commitLanguageRow(args: {
  base: string
  tags: Tags
  tagKey?: string
  code: string
  value: string
}): LanguageCommit {
  const { base, tags, tagKey, code, value } = args
  const text = code.trim()
  const cleaned = cleanValue(value)
  if (text === '') {
    if (tagKey !== undefined) {
      return { kind: 'error', message: 'Enter a language code, or remove this translation.' }
    }
    return cleaned === undefined ? { kind: 'discard' } : { kind: 'wait' }
  }
  const normalized = normalizeLanguageCode(text)
  if (normalized === undefined) {
    return { kind: 'error', message: 'Use a language code such as de, pt-BR or zh-Hant.' }
  }
  const newKey = `${base}:${normalized}`
  if (newKey !== tagKey && nonEmpty(tags[newKey])) {
    return { kind: 'error', message: `${newKey} already has a value.` }
  }
  if (tagKey === undefined && cleaned === undefined) return { kind: 'wait' }

  const written: TagEdit[] = []
  if (tagKey !== undefined && tagKey !== newKey) written.push({ key: tagKey, value: undefined })
  written.push({ key: newKey, value: cleaned })
  return {
    kind: 'write',
    edits: written.filter((edit) => (tags[edit.key] ?? '') !== (edit.value ?? '')),
  }
}
