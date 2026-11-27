/**
 * The tags' suggestions: the taginfo answers (or any source of the same shape) turned into the sheet's
 * suggestions, with the filters and the order of iD's raw tag editor (`modules/ui/sections/raw_tag_editor.js`,
 * the key and value fetchers). The taginfo client itself is packages/core/src/taginfo/taginfo.ts.
 */
import type { SheetColumn, SheetRow, SheetSuggestion, Suggest } from '../types.ts'
import { keyOfPattern, presetKeysFor, SIDE_TOKEN } from './tag-sides.ts'
import { rowKey } from './tags.ts'

/** iD's taginfo.js debounces 300 ms; the sheet waits this long before a request (sheet-design.md). */
export const TAG_SUGGEST_DELAY_MS = 300

/** One answer of a source: the value, and its description when there is one (iD's `title`). */
export type TagSuggestion = { value: string; title?: string }

/** Where the tags' suggestions come from. Each call gets the signal; the sheet aborts it on the next keystroke. */
export type TagSuggestSource = {
  keys(query: string, signal: AbortSignal): Promise<readonly TagSuggestion[]>
  values(key: string, query: string, signal: AbortSignal): Promise<readonly TagSuggestion[]>
  /**
   * The values the presets' fields offer for a key, with their labels (`Presets.valueOptions`): shown first, at once,
   * with no request. Absent: none.
   */
  options?: (key: string) => readonly { value: string; label: string }[]
}

/** iD raw_tag_editor `sort(value, data)`: the items that start with the typed text first, the rest after, both in order. */
export function sortPrefixFirst(
  text: string,
  items: readonly SheetSuggestion[],
): SheetSuggestion[] {
  const same: SheetSuggestion[] = []
  const other: SheetSuggestion[] = []
  for (const item of items) (item.value.startsWith(text) ? same : other).push(item)
  return [...same, ...other]
}

/**
 * Keys: iD's key fetcher. A key that the feature already has (other than the row's own) is left out, and so is
 * a key ending in `_1`, `_2` ... (iD #9422). The key must contain the typed text, ignoring case.
 * iD's `_discardTags` list is not here: Maid has no such list yet.
 */
export function keySuggestions(
  text: string,
  items: readonly SheetSuggestion[],
  usedKeys: ReadonlySet<string>,
): SheetSuggestion[] {
  const typed = text.toLowerCase()
  const kept = items.filter(
    (item) =>
      !usedKeys.has(item.value) &&
      !/_\d$/.test(item.value) &&
      item.value.toLowerCase().includes(typed),
  )
  return sortPrefixFirst(text, kept)
}

/** Values: iD's value fetcher. The value must contain the typed text, ignoring case; prefix first. */
export function valueSuggestions(
  text: string,
  items: readonly SheetSuggestion[],
): SheetSuggestion[] {
  const typed = text.toLowerCase()
  return sortPrefixFirst(
    text,
    items.filter((item) => item.value.toLowerCase().includes(typed)),
  )
}

/** A source's answers as sheet suggestions: the description becomes the hint when it says more than the value. */
export function toSheetSuggestions(items: readonly TagSuggestion[]): SheetSuggestion[] {
  return items.map((item) =>
    item.title !== undefined && item.title !== item.value
      ? { value: item.value, hint: item.title }
      : { value: item.value },
  )
}

/**
 * The tag columns with the source as their suggestions. The key column leaves out the keys of the other rows;
 * the value column asks for the values of the row's key (no key, no request). `rows` is the list the sheet
 * shows: the columns are made again when it changes.
 */
export function withTagSuggestions(
  columns: readonly SheetColumn[],
  source: TagSuggestSource | undefined,
  rows: readonly SheetRow[],
): SheetColumn[] {
  const keySuggest: Suggest = async (ctx, signal) => {
    // a group row's key is a pattern (`cycleway:{side}:width`): taginfo has no such keys
    if (source === undefined || rowKey(ctx.row).includes(SIDE_TOKEN)) return []
    const used = new Set(rows.filter((row) => row.id !== ctx.row.id).map(rowKey))
    const items = await source.keys(ctx.text, signal)
    return keySuggestions(ctx.text, toSheetSuggestions(items), used)
  }
  // The values several features have (a mixed row) come first, then the source's answers (iD: local values
  // only for a mixed key, taginfo after them). Without a source the mixed values are all there is: no delay.
  const valueSuggest: Suggest = async (ctx, signal) => {
    // a group row of the sides view: the values of the side's own key (the value column is the left side)
    const written = rowKey(ctx.row)
    const key = written.includes(SIDE_TOKEN)
      ? keyOfPattern(written, ctx.cell.col === 'right' ? 'right' : 'left')
      : written
    if (key === '') return []
    const offered = valueSuggestions(ctx.text, mixedValueSuggestions(ctx.row, ctx.cell.col))
    if (source === undefined) return offered
    const fromPresets = valueSuggestions(ctx.text, presetSuggestions(key, source))
    // the presets' values do not wait long for taginfo: a slow answer is left out this time (its query cache keeps
    // it for the next edit)
    const items = await withinTime(source.values(key, ctx.text, signal), TAGINFO_WAIT_MS)
    return uniqueValues([
      ...offered,
      ...fromPresets,
      ...valueSuggestions(ctx.text, toSheetSuggestions(items)),
    ])
  }
  const delay = source === undefined ? 0 : TAG_SUGGEST_DELAY_MS
  return columns.map((column) => {
    if (column.id === 'key' && source !== undefined) {
      return { ...column, suggest: keySuggest, suggestDelay: delay }
    }
    if (column.id === 'value' || column.id === 'right') {
      return { ...column, suggest: valueSuggest, suggestDelay: delay }
    }
    return column
  })
}

/**
 * The distinct values of a mixed cell (the value column, or a side column of the sides view), as suggestions. A missing
 * tag is not a value to suggest.
 */
export function mixedValueSuggestions(row: SheetRow, col = 'value'): SheetSuggestion[] {
  const cell = row.cells[col]?.value
  if (cell?.kind !== 'mixed') return []
  return cell.values.flatMap((entry) => (entry.text === undefined ? [] : [{ value: entry.text }]))
}

/** The first of each value: a value both sources give is offered once. */
function uniqueValues(items: readonly SheetSuggestion[]): SheetSuggestion[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    if (seen.has(item.value)) return false
    seen.add(item.value)
    return true
  })
}

/**
 * The presets' values for a key, from the closest key that has any (presetKeysFor: the key, then without its side,
 * then the part after the side), each with its label as the hint. Empty values (a check field's "not set") are left
 * out.
 */
export function presetSuggestions(key: string, source: TagSuggestSource): SheetSuggestion[] {
  if (source.options === undefined) return []
  for (const candidate of presetKeysFor(key)) {
    const options = source.options(candidate).filter((option) => option.value !== '')
    if (options.length === 0) continue
    return options.map((option) =>
      option.label !== '' && option.label !== option.value
        ? { value: option.value, hint: option.label }
        : { value: option.value },
    )
  }
  return []
}

/** How long the value list waits for taginfo before it shows what it has (the presets' values, the mixed values) */
export const TAGINFO_WAIT_MS = 1500

/** The answer, or an empty list when it takes longer than `ms` */
function withinTime<T>(answer: Promise<readonly T[]>, ms: number): Promise<readonly T[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve([]), ms)
    void answer.then(
      (items) => {
        clearTimeout(timer)
        resolve(items)
      },
      () => {
        clearTimeout(timer)
        resolve([])
      },
    )
  })
}
