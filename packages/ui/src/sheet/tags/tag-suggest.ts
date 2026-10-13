/**
 * The tags' suggestions: the taginfo answers (or any source of the same shape) turned into the sheet's
 * suggestions, with the filters and the order of iD's raw tag editor (`modules/ui/sections/raw_tag_editor.js`,
 * the key and value fetchers). The taginfo client itself is packages/core/src/taginfo/taginfo.ts.
 */
import type { SheetColumn, SheetRow, SheetSuggestion, Suggest } from '../types.ts'
import { rowKey } from './tags.ts'

/** iD's taginfo.js debounces 300 ms; the sheet waits this long before a request (sheet-design.md). */
export const TAG_SUGGEST_DELAY_MS = 300

/** One answer of a source: the value, and its description when there is one (iD's `title`). */
export type TagSuggestion = { value: string; title?: string }

/** Where the tags' suggestions come from. Each call gets the signal; the sheet aborts it on the next keystroke. */
export type TagSuggestSource = {
  keys(query: string, signal: AbortSignal): Promise<readonly TagSuggestion[]>
  values(key: string, query: string, signal: AbortSignal): Promise<readonly TagSuggestion[]>
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
  source: TagSuggestSource,
  rows: readonly SheetRow[],
): SheetColumn[] {
  const keySuggest: Suggest = async (ctx, signal) => {
    const used = new Set(rows.filter((row) => row.id !== ctx.row.id).map(rowKey))
    const items = await source.keys(ctx.text, signal)
    return keySuggestions(ctx.text, toSheetSuggestions(items), used)
  }
  const valueSuggest: Suggest = async (ctx, signal) => {
    const key = rowKey(ctx.row)
    if (key === '') return []
    const items = await source.values(key, ctx.text, signal)
    return valueSuggestions(ctx.text, toSheetSuggestions(items))
  }
  return columns.map((column) => {
    if (column.id === 'key') {
      return { ...column, suggest: keySuggest, suggestDelay: TAG_SUGGEST_DELAY_MS }
    }
    if (column.id === 'value') {
      return { ...column, suggest: valueSuggest, suggestDelay: TAG_SUGGEST_DELAY_MS }
    }
    return column
  })
}
