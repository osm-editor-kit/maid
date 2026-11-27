/**
 * The "sides" view of the Tags sheet: the keys that describe the left and the right of a road (cycleway, sidewalk,
 * parking) as groups, and `:both` shown as its two sides. What is stored does not change: two sides with the same
 * value are written as `:both` again (mergeSides). Pure: no React, no DOM.
 *
 * A key belongs to a group when the group is its first part (`cycleway`, `cycleway:left:width`) or its second, after a
 * meta prefix (`source:cycleway:both:width`, `fixme:sidewalk`, `mapillary:cycleway:right`). TILDA reads the meta
 * prefixes `source` and `note` the same way (processing/topics/roads_bikelanes/bikelanes/transformations.lua:
 * `<metaPrefix>:<prefix>:<infix>:SUFFIX`); here any first part counts, so `fixme` and `check_date` sort in too.
 */
import { m } from '@osm-editor-kit/maid-i18n'
import type { Tags } from '@osm-editor-kit/maid-presets'
import { directionalKeys, sideValue } from '../../inspector/fields/directional-logic.ts'
import type { Combined, CombinedTags } from '../../inspector/fields/shared.ts'
import {
  isSideOffValue,
  SIDE_GROUPS,
  sideOffError,
  suffixAllowedWhenOff,
  type SideGroup,
} from '../../inspector/fields/side-off.ts'
import type { CellValue, SheetBatch, SheetRow } from '../types.ts'
import { cellValueOf, type TagSheetChange } from './tag-combined.ts'
import { cleanText, codeUnits, NONE, readOnlyText, type ReadOnlyKeys } from './tags.ts'

export { SIDE_GROUPS, type SideGroup }

const GROUPS = new Set<string>(SIDE_GROUPS)

/** Where a key stands in its group: the group, the meta prefix before it, and the key without the meta prefix */
export type SidePlace = { group: SideGroup; meta: string | undefined; path: string }

/** The group of a key, or undefined when it describes no side group */
export function sidePlaceOf(key: string): SidePlace | undefined {
  const parts = key.split(':')
  const [first, second] = parts
  if (first !== undefined && GROUPS.has(first)) {
    return { group: first as SideGroup, meta: undefined, path: key }
  }
  if (second !== undefined && first !== undefined && first !== '' && GROUPS.has(second)) {
    return { group: second as SideGroup, meta: first, path: parts.slice(1).join(':') }
  }
  return undefined
}

/**
 * The order of the sides view: first every key in no group, as iD sorts them (`codeUnits`), without a heading; then
 * the groups in the order of SIDE_GROUPS. Inside a group the keys sort without their meta prefix, the plain key first,
 * so `source:cycleway:both:width` stands right under `cycleway:both:width`.
 */
export function compareSideKeys(a: string, b: string): number {
  const pa = sidePlaceOf(a)
  const pb = sidePlaceOf(b)
  const rank = (place: SidePlace | undefined) =>
    place === undefined ? -1 : SIDE_GROUPS.indexOf(place.group)
  const first = rank(pa) - rank(pb)
  if (first !== 0) return first
  if (pa === undefined || pb === undefined) return codeUnits(a, b)
  return codeUnits(pa.path, pb.path) || codeUnits(pa.meta ?? '', pb.meta ?? '')
}

/** The key with its side part (right after the group) set to `side`, or undefined when it has no side part */
function withSide(key: string, side: 'left' | 'right' | 'both'): string | undefined {
  const place = sidePlaceOf(key)
  if (place === undefined) return undefined
  const parts = key.split(':')
  const at = place.meta === undefined ? 1 : 2
  const current = parts[at]
  if (current !== 'left' && current !== 'right' && current !== 'both') return undefined
  parts[at] = side
  return parts.join(':')
}

/** The side a key describes (`cycleway:left:width` → left), or undefined */
export function sideOf(key: string): 'left' | 'right' | 'both' | undefined {
  const place = sidePlaceOf(key)
  if (place === undefined) return undefined
  const part = key.split(':')[place.meta === undefined ? 1 : 2]
  return part === 'left' || part === 'right' || part === 'both' ? part : undefined
}

/**
 * The tags as the sides view shows them: every `…:both…` key of a side group as its `left` and `right` key. A `both`
 * key whose side already has another value stays as it is (the data says two things; the person sees both).
 */
export function splitBoth(tags: Tags): Tags {
  const out: Record<string, string> = { ...tags }
  for (const [key, value] of Object.entries(tags)) {
    if (sideOf(key) !== 'both') continue
    const left = withSide(key, 'left')
    const right = withSide(key, 'right')
    if (left === undefined || right === undefined) continue
    const clash = [left, right].some((side) => tags[side] !== undefined && tags[side] !== value)
    if (clash) continue
    delete out[key]
    out[left] = value
    out[right] = value
  }
  return out
}

/**
 * The tags to store after a change in the sides view. A `left` and `right` key with the same value become one `both`
 * key when the feature had that `both` key, or when the change touched one of the two (a side set to the value of the
 * other). Two equal sides that nobody touched and that were stored apart stay apart: the view does not rewrite data
 * the person did not change.
 *
 * `next`: the shown tags after the change. `shown`: the shown tags before it. `stored`: the feature's tags.
 */
export function mergeSides(next: Tags, shown: Tags, stored: Tags): Tags {
  const out: Record<string, string> = { ...next }
  for (const [key, value] of Object.entries(next)) {
    if (sideOf(key) !== 'left') continue
    const right = withSide(key, 'right')
    const both = withSide(key, 'both')
    if (right === undefined || both === undefined) continue
    if (next[right] !== value || next[both] !== undefined) continue
    const touched = shown[key] !== value || shown[right] !== next[right]
    if (stored[both] === undefined && !touched) continue
    delete out[key]
    delete out[right]
    out[both] = value
  }
  return out
}

/** True when two sets of tags have the same keys and values */
export function sameTags(a: Tags, b: Tags): boolean {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => b[key] === a[key])
}

/** The place of the side in a pattern key: `cycleway:{side}:width` stands for `cycleway:left:width` and its right */
export const SIDE_TOKEN = '{side}'

export type Side = 'left' | 'right'

/** A left or right key as its pattern and side (`cycleway:left:width` → `cycleway:{side}:width`, left) */
export function sidePatternOf(key: string): { pattern: string; side: Side } | undefined {
  const side = sideOf(key)
  if (side !== 'left' && side !== 'right') return undefined
  const place = sidePlaceOf(key)
  if (place === undefined) return undefined
  const parts = key.split(':')
  parts[place.meta === undefined ? 1 : 2] = SIDE_TOKEN
  return { pattern: parts.join(':'), side }
}

/** The key of one side of a pattern */
export function keyOfPattern(pattern: string, side: Side): string {
  return pattern.replace(SIDE_TOKEN, side)
}

/**
 * One attribute of a side group: its pattern and the value on each side (absent: no tag on that side). `V` is a
 * value: a text for one feature, a `Combined` (one value or "Multiple values") for several.
 */
export type SideRow<V = string> = { pattern: string; left?: V; right?: V }

/**
 * The sided keys of one group, a row per pattern, in the order of the sides view. `common`: the group's keys with no
 * side that say something about both sides (`sidewalk=no`, and a `sidewalk:both` that could not be split), which the
 * rows do not show; absent when there are none. They decide which side is off (sidesOff).
 */
export type SideGroupRows<V = string> = {
  group: SideGroup
  rows: SideRow<V>[]
  common?: Record<string, V>
}

/**
 * The shown tags of the sides view, split: the tags with no side (shown in the two-column table on top, the plain
 * `cycleway`, `fixme:sidewalk` and a `:both` key that could not be split among them) and, per group, the left and
 * right keys as rows of three columns. Groups without such keys are left out. For one feature or, with combined
 * values, for several.
 */
export function sideLayout<V>(shown: Readonly<Record<string, V>>): {
  plain: Record<string, V>
  groups: SideGroupRows<V>[]
} {
  const plain: Record<string, V> = {}
  const byGroup = new Map<SideGroup, Map<string, SideRow<V>>>()
  for (const [key, value] of Object.entries(shown)) {
    const sided = sidePatternOf(key)
    const place = sidePlaceOf(key)
    if (sided === undefined || place === undefined) {
      plain[key] = value
      continue
    }
    const rows = byGroup.get(place.group) ?? new Map<string, SideRow<V>>()
    byGroup.set(place.group, rows)
    const row = rows.get(sided.pattern) ?? { pattern: sided.pattern }
    row[sided.side] = value
    rows.set(sided.pattern, row)
  }
  const groups: SideGroupRows<V>[] = []
  for (const group of SIDE_GROUPS) {
    const rows = byGroup.get(group)
    if (rows === undefined) continue
    const sorted = [...rows.values()].sort((a, b) =>
      compareSideKeys(keyOfPattern(a.pattern, 'left'), keyOfPattern(b.pattern, 'left')),
    )
    const common: Record<string, V> = {}
    for (const key of [group, `${group}:both`]) {
      const value = plain[key]
      if (value !== undefined) common[key] = value
    }
    groups.push(
      Object.keys(common).length === 0 ? { group, rows: sorted } : { group, rows: sorted, common },
    )
  }
  return { plain, groups }
}

/** The id of a pattern's row in the sheet */
export function sideRowId(pattern: string): string {
  return `${SIDE_ROW}${pattern}`
}

/** True for the row of a side group (its id is `sideRowId`) */
export function isSideRow(id: string): boolean {
  return id.startsWith(SIDE_ROW)
}

const SIDE_ROW = 'side:'

/**
 * One change of the shown tags, the same for every feature: a key set, a key removed, or a key renamed (a feature
 * that has `from` and not `to` keeps its own value under `to`; the others are not changed).
 */
export type TagStep =
  | { type: 'set'; key: string; value: string }
  | { type: 'remove'; key: string }
  | { type: 'rename'; from: string; to: string }

/** The steps applied in order to one feature's shown tags */
export function applySteps(tags: Tags, steps: readonly TagStep[]): Tags {
  const out: Record<string, string> = { ...tags }
  for (const step of steps) {
    if (step.type === 'set') out[step.key] = step.value
    else if (step.type === 'remove') delete out[step.key]
    else if (out[step.from] !== undefined && out[step.to] === undefined) {
      out[step.to] = out[step.from] ?? ''
      delete out[step.from]
    }
  }
  return out
}

/**
 * One batch of the group rows as steps: a value sets or clears that side's key; a new key text renames both sides (it
 * must keep `{side}` where the side stands, in the same group, and not take keys that exist: `taken`); clearing the
 * key or removing the row removes both sides. New rows come from the table on top, not from here.
 */
export function sideSteps(
  rows: readonly SideRow<unknown>[],
  batch: SheetBatch,
  taken: (key: string) => boolean,
  readOnlyKey: ReadOnlyKeys = NONE,
): { steps: TagStep[]; refused: string[] } {
  const steps: TagStep[] = []
  const refused: string[] = []
  const rowOf = (id: string) => rows.find((row) => sideRowId(row.pattern) === id)
  const sides: Side[] = ['left', 'right']
  // a read-only key is never written: the whole change of its row is refused
  const blocked = (pattern: string) => {
    if (!sides.some((side) => readOnlyKey(keyOfPattern(pattern, side)))) return false
    refused.push(readOnlyText())
    return true
  }
  const removeBoth = (row: SideRow<unknown>) => {
    for (const side of sides) steps.push({ type: 'remove', key: keyOfPattern(row.pattern, side) })
  }
  for (const change of batch.changes) {
    if (change.type === 'insert') {
      refused.push(m.ui_tags_side_new_row())
      continue
    }
    const row = rowOf(change.row)
    if (row === undefined || blocked(row.pattern)) continue
    if (change.type === 'remove') {
      removeBoth(row)
      continue
    }
    // the value column is the left side (it is the value column of the rows with no side above)
    const side: Side | undefined =
      change.col === 'value' ? 'left' : change.col === 'right' ? 'right' : undefined
    if (side !== undefined) {
      const key = keyOfPattern(row.pattern, side)
      const value = change.type === 'set' ? cleanText(change.text) : ''
      steps.push(value === '' ? { type: 'remove', key } : { type: 'set', key, value })
      continue
    }
    if (change.col !== 'key') continue
    if (change.type === 'clear') {
      removeBoth(row)
      continue
    }
    const pattern = cleanText(change.text)
    if (pattern === row.pattern) continue
    const left = keyOfPattern(pattern, 'left')
    const from = sidePlaceOf(keyOfPattern(row.pattern, 'left'))
    if (
      pattern.split(SIDE_TOKEN).length !== 2 ||
      sidePatternOf(left)?.pattern !== pattern ||
      sidePlaceOf(left)?.group !== from?.group
    ) {
      refused.push(m.ui_tags_side_token({ token: SIDE_TOKEN }))
      continue
    }
    if (blocked(pattern)) continue
    if (sides.some((each) => taken(keyOfPattern(pattern, each)))) {
      refused.push(duplicateOf(pattern))
      continue
    }
    for (const each of sides) {
      steps.push({
        type: 'rename',
        from: keyOfPattern(row.pattern, each),
        to: keyOfPattern(pattern, each),
      })
    }
  }
  return { steps, refused }
}

/** One batch of the group rows on one feature's shown tags (sideSteps, applied) */
export function applySideBatch(
  shown: Tags,
  rows: readonly SideRow<unknown>[],
  batch: SheetBatch,
  readOnlyKey: ReadOnlyKeys = NONE,
): { tags: Tags; refused: string[] } {
  const taken = (key: string) => shown[key] !== undefined
  const { steps, refused } = sideSteps(rows, batch, taken, readOnlyKey)
  return { tags: applySteps(shown, steps), refused }
}

/**
 * The shown tags after a change of the rows with no side (`before` → `after`): what they removed goes, what they set
 * is set. A key with a side entered there (a paste, the empty row) wins over what the group rows show, and a `:both`
 * key entered there is set as its two sides, so the sheet never writes `:both` beside a side that says otherwise.
 */
export function shownAfterPlain(shown: Tags, before: Tags, after: Tags): Tags {
  const out: Record<string, string> = { ...shown }
  for (const key of Object.keys(before)) if (after[key] === undefined) delete out[key]
  for (const [key, value] of Object.entries(after)) {
    if (before[key] === value) continue
    const left = sideOf(key) === 'both' ? withSide(key, 'left') : undefined
    const right = sideOf(key) === 'both' ? withSide(key, 'right') : undefined
    if (left === undefined || right === undefined) {
      out[key] = value
      continue
    }
    delete out[key]
    out[left] = value
    out[right] = value
  }
  return out
}

/** The steps of the rows with no side for several features, a `:both` key set there as its two sides (shownAfterPlain) */
export function splitBothSteps(steps: readonly TagStep[]): TagStep[] {
  return steps.flatMap((step): TagStep[] => {
    if (step.type !== 'set' || sideOf(step.key) !== 'both') return [step]
    const left = withSide(step.key, 'left')
    const right = withSide(step.key, 'right')
    if (left === undefined || right === undefined) return [step]
    return [
      { type: 'remove', key: step.key },
      { type: 'set', key: left, value: step.value },
      { type: 'set', key: right, value: step.value },
    ]
  })
}

function duplicateOf(pattern: string): string {
  return m.ui_sheet_duplicate({ column: m.ui_tags_key(), value: pattern })
}

/**
 * The combined tags of several features, as `combinedTags` in packages/model (iD's utilCombinedTags): per key one
 * value when every feature has it with the same value, else the values by how many features have them, and whether a
 * feature lacks it. The sides view combines the features' shown tags (`:both` split) with it.
 */
export function combineTags(tagsOfEach: readonly Tags[]): CombinedTags {
  const keys = new Set<string>()
  for (const tags of tagsOfEach) for (const key of Object.keys(tags)) if (key !== '') keys.add(key)
  const out: Record<string, Combined> = {}
  for (const key of keys) {
    const counts = new Map<string, number>()
    let missing = false
    for (const tags of tagsOfEach) {
      const value = Object.hasOwn(tags, key) ? tags[key] : undefined
      if (value === undefined || value === '') missing = true
      else counts.set(value, (counts.get(value) ?? 0) + 1)
    }
    const ranked = [...counts].sort(([, a], [, b]) => b - a)
    const first = ranked[0]
    if (first === undefined) continue
    out[key] =
      ranked.length === 1 && !missing
        ? { kind: 'one', value: first[0] }
        : { kind: 'mixed', values: ranked.map(([value]) => value), missing }
  }
  return out
}

/** A side's value as the cell shows it: a text, or "Multiple values" for several features that differ */
function sideCell(value: string | Combined): CellValue {
  return typeof value === 'string' ? { kind: 'value', text: value } : cellValueOf(value)
}

/**
 * True when a group row may have a value on a side that is off: the side key's own meta keys (`source:parking:left`
 * describes the "no"), and the attributes listed for the group and value (`parking:left:restriction` says why there
 * is no parking). The list is shared with the inspector's sub fields (side-off.ts).
 */
export function allowedWhenOff(group: SideGroup, value: string, pattern: string): boolean {
  const suffix = (pattern.split(SIDE_TOKEN)[1] ?? '').replace(/^:/, '')
  return suffixAllowedWhenOff(group, value, suffix)
}

/** The value of a combined cell when every feature has it: the text of a single value, else undefined */
function singleValue(value: string | Combined | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.kind === 'one' ? value.value : undefined
}

/**
 * The sides a group turns off, as the inspector reads them (directional-logic's sideValue: the side's own key, else the
 * common keys, `sidewalk=no`, `sidewalk=left` for the other side, `cycleway:both=no`): the side and its value
 * (no, none, separate). `common`: the group's keys with no side (SideGroupRows.common). For several features only a
 * value they all share counts: a side whose key, or the common key it falls back to, is mixed is not off.
 */
export function sidesOff(
  group: SideGroup,
  rows: readonly SideRow<string | Combined>[],
  common: Readonly<Record<string, string | Combined>> = {},
): Partial<Record<Side, string>> {
  const keys = directionalKeys(`${group}:both`)
  const own = rows.find((row) => row.pattern === `${group}:${SIDE_TOKEN}`)
  const commonMixed = [keys.fallback, keys.both].some(
    (key) => common[key] !== undefined && singleValue(common[key]) === undefined,
  )
  const off: Partial<Record<Side, string>> = {}
  for (const side of ['left', 'right'] as const) {
    const cell = own?.[side]
    // a mixed side key, or a mixed common key behind a side with no key of its own, is no value all features share
    if (cell !== undefined ? singleValue(cell) === undefined : commonMixed) continue
    const tags: Record<string, string> = {}
    for (const key of [keys.fallback, keys.both]) {
      const value = singleValue(common[key])
      if (value !== undefined) tags[key] = value
    }
    const sideText = singleValue(cell)
    if (sideText !== undefined) tags[keys[side]] = sideText
    const value = sideValue(keys, tags, side)
    if (isSideOffValue(value)) off[side] = value
  }
  return off
}

/**
 * A group's rows as rows of the Tags sheet: the pattern as the key, the left side in the value column and the right
 * side in the column after it (`right`), each cell only when that side has a tag. The cells are named by their side.
 * A side that is off (`sidesOff`: no, none, separate; also by the group's keys with no side, `common`) has its other
 * cells locked and grey; a value left there is invalid, with what to do about it (remove it; move it to the separately
 * mapped way).
 */
export function sideSheetRows(
  rows: readonly SideRow<string | Combined>[],
  group: SideGroup,
  readOnlyKey: ReadOnlyKeys = NONE,
  common: Readonly<Record<string, string | Combined>> = {},
): SheetRow[] {
  const off = sidesOff(group, rows, common)
  const own = `${group}:${SIDE_TOKEN}`
  return rows.map((row) => {
    // a pattern is no key taginfo knows: no list for it. A row with a read-only side cannot be renamed or removed.
    const keyLocked =
      readOnlyKey(keyOfPattern(row.pattern, 'left')) ||
      readOnlyKey(keyOfPattern(row.pattern, 'right'))
    const cells: SheetRow['cells'] = {
      key: {
        value: { kind: 'value', text: row.pattern },
        noSuggestions: true,
        readOnly: keyLocked,
      },
    }
    for (const side of ['left', 'right'] as const) {
      const col = side === 'left' ? 'value' : 'right'
      const value = row[side]
      const locked = readOnlyKey(keyOfPattern(row.pattern, side))
      if (value !== undefined) cells[col] = { value: sideCell(value), readOnly: locked }
      const offValue = off[side]
      if (
        row.pattern === own ||
        offValue === undefined ||
        allowedWhenOff(group, offValue, row.pattern)
      ) {
        continue
      }
      const cell = cells[col]
      const key = keyOfPattern(own, side)
      cells[col] =
        cell === undefined
          ? { value: { kind: 'value', text: '' }, readOnly: true }
          : {
              ...cell,
              invalid: sideOffError(offValue, key),
            }
    }
    return {
      id: sideRowId(row.pattern),
      label: row.pattern.replace(SIDE_TOKEN, 'side'),
      cells,
      // the side words of the keys, not translated: the sheet shows raw tags
      colLabels: { value: 'left', right: 'right' },
    }
  })
}

/** Copy of one side row: `key=value` lines of the sides in `cols` (value: left), or the pattern for the key alone */
export function copySideRow(row: SheetRow, cols: readonly string[]): string[] {
  const cell = row.cells.key?.value
  const pattern = cell?.kind === 'value' ? cell.text : ''
  const sides = (
    [
      ['value', 'left'],
      ['right', 'right'],
    ] as const
  ).filter(([col]) => cols.includes(col))
  if (sides.length === 0) return [pattern]
  return sides.flatMap(([col, side]) => {
    const value = row.cells[col]?.value
    return value?.kind === 'value' && value.text !== ''
      ? [`${keyOfPattern(pattern, side)}=${value.text}`]
      : []
  })
}

/**
 * The keys whose preset options fit a key's values, the closest first: the key itself; without its side
 * (`cycleway:left:lane` → `cycleway:lane`, `cycleway:left` → `cycleway`); the part after the side
 * (`cycleway:left:surface` → `surface`). A key with a meta prefix (`source:…`) only as itself: its values are no
 * values of the key it describes.
 */
export function presetKeysFor(key: string): string[] {
  const place = sidePlaceOf(key)
  if (place === undefined || place.meta !== undefined) return [key]
  const parts = key.split(':')
  const keys = [key]
  if (sideOf(key) !== undefined) {
    keys.push([parts[0], ...parts.slice(2)].join(':'))
    if (parts.length > 2) keys.push(parts.slice(2).join(':'))
  } else if (parts.length > 1) {
    keys.push(parts.slice(1).join(':'))
  }
  return [...new Set(keys)]
}

/**
 * The steps of a change the table for several features makes (renames first, then removes, then sets, as the
 * engine writes a TagSheetChange on each feature)
 */
export function stepsOfChange(change: TagSheetChange): TagStep[] {
  return [
    ...(change.rename ?? []).map((rename): TagStep => ({ type: 'rename', ...rename })),
    ...(change.remove ?? []).map((key): TagStep => ({ type: 'remove', key })),
    ...Object.entries(change.set ?? {}).map(([key, value]): TagStep => ({
      type: 'set',
      key,
      value,
    })),
  ]
}

/** What turns `before` into `after`: the keys to set and the keys to remove (the shape of the engine's tag change) */
export function tagDiff(
  before: Tags,
  after: Tags,
): { set: Record<string, string>; remove: string[] } {
  const set: Record<string, string> = {}
  for (const [key, value] of Object.entries(after)) if (before[key] !== value) set[key] = value
  const remove = Object.keys(before).filter((key) => after[key] === undefined)
  return { set, remove }
}
