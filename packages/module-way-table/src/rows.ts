/**
 * The rows of the table: the union of the keys of the columns, in groups (docs/research/way-table.md, 4.3). Pure.
 *
 * A key is matched by the first group whose pattern matches it. Patterns are exact keys or globs with `*` (any
 * text): `maxspeed*` is a prefix, `*:cycleway` a suffix, `*:lanes*` a part. The last group, Other, matches every key.
 * Inside a group the keys come in `keyOrder` first (the reference's preset keys, in the preset's order), then A to Z.
 * A group with no key is not returned.
 */
import { type Cell, type ColumnView, cellState, viewOf } from './cell-state.ts'
import type { Column } from './types.ts'

export type GroupId =
  | 'name'
  | 'road'
  | 'lanes'
  | 'parking'
  | 'cycling'
  | 'footway'
  | 'water-rail'
  | 'building'
  | 'other'

export type GroupDef = { readonly id: GroupId; readonly patterns: readonly string[] }

/** The groups in the order they are shown */
export const GROUPS: readonly GroupDef[] = [
  {
    id: 'name',
    patterns: ['name', 'ref', 'alt_name', 'official_name', 'old_name', 'int_name', 'source:name'],
  },
  {
    id: 'road',
    patterns: [
      'highway',
      'surface',
      'smoothness',
      'maxspeed*',
      'lit',
      'oneway*',
      'access*',
      'bridge',
      'tunnel',
      'layer',
      'width',
      'incline',
      'junction',
    ],
  },
  { id: 'lanes', patterns: ['lanes*', '*:lanes*', 'turn:lanes*', 'change:lanes*', 'placement*'] },
  { id: 'parking', patterns: ['parking*'] },
  {
    id: 'cycling',
    patterns: ['cycleway*', 'bicycle*', '*:cycleway', 'cyclestreet', 'bicycle_road'],
  },
  { id: 'footway', patterns: ['sidewalk*', 'foot*', 'footway'] },
  {
    id: 'water-rail',
    patterns: ['waterway*', 'intermittent', 'railway*', 'electrified', 'gauge', 'usage', 'tracks'],
  },
  { id: 'building', patterns: ['building*', 'roof:*', 'height', 'min_height', 'addr:*'] },
  { id: 'other', patterns: ['*'] },
]

function escapeRegExp(text: string): string {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
}

const globs = new Map<string, RegExp>()

/** A glob with `*` (any text) as a regular expression; anchored at both ends. Compiled once per pattern. */
export function globToRegExp(pattern: string): RegExp {
  let regexp = globs.get(pattern)
  if (!regexp) {
    regexp = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`)
    globs.set(pattern, regexp)
  }
  return regexp
}

export type Row = {
  readonly key: string
  readonly group: GroupId
  /** At least one column differs from the reference (different, added or missing) */
  readonly differs: boolean
  /** One cell per column id */
  readonly cells: Readonly<Record<string, Cell>>
}

export type RowGroup = {
  readonly id: GroupId
  readonly rows: readonly Row[]
  /** The rows of the group that differ, also when `onlyDiffering` hides them */
  readonly differing: number
}

export type RowOptions = {
  /** The column that is the reference (the selected way) */
  readonly referenceId: string
  /** Keys in the order they come first inside a group, usually the reference's preset keys */
  readonly keyOrder?: readonly string[]
  /** Show only the rows that differ (default false) */
  readonly onlyDiffering?: boolean
  /** The groups (default `GROUPS`) */
  readonly groups?: readonly GroupDef[]
}

/** The group of a key: the first group whose pattern matches it */
export function groupOf(key: string, groups: readonly GroupDef[] = GROUPS): GroupId | undefined {
  for (const group of groups) {
    if (group.patterns.some((pattern) => globToRegExp(pattern).test(key))) return group.id
  }
  return undefined
}

function isDiffering(state: Cell['state']): boolean {
  return state === 'different' || state === 'added' || state === 'missing'
}

/** The rows of the columns, grouped. The reference column is `options.referenceId`; without it no column is the reference. */
export function buildRows(columns: readonly Column[], options: RowOptions): RowGroup[] {
  const groups = options.groups ?? GROUPS
  const views = columns.map((column) => ({ id: column.id, view: viewOf(column), column }))
  const reference: ColumnView = views.find((v) => v.id === options.referenceId)?.view ?? new Map()

  const keys = new Set<string>()
  for (const { view } of views) for (const key of view.keys()) keys.add(key)

  const rank = new Map<string, number>()
  for (const [index, key] of (options.keyOrder ?? []).entries()) {
    if (!rank.has(key)) rank.set(key, index)
  }

  const byGroup = new Map<GroupId, Row[]>()
  for (const key of keys) {
    const group = groupOf(key, groups)
    if (group === undefined) continue
    const cells: Record<string, Cell> = {}
    for (const { id, view } of views) {
      cells[id] = cellState(reference, view, key, id === options.referenceId)
    }
    const differs = Object.values(cells).some((cell) => isDiffering(cell.state))
    const rows = byGroup.get(group) ?? []
    rows.push({ key, group, differs, cells })
    byGroup.set(group, rows)
  }

  const result: RowGroup[] = []
  for (const group of groups) {
    const rows = byGroup.get(group.id)
    if (!rows || rows.length === 0) continue
    rows.sort((a, b) => {
      const ra = rank.get(a.key) ?? Number.POSITIVE_INFINITY
      const rb = rank.get(b.key) ?? Number.POSITIVE_INFINITY
      if (ra !== rb) return ra < rb ? -1 : 1
      return a.key < b.key ? -1 : a.key > b.key ? 1 : 0
    })
    const differing = rows.filter((row) => row.differs).length
    const shown = options.onlyDiffering ? rows.filter((row) => row.differs) : rows
    if (shown.length === 0) continue
    result.push({ id: group.id, rows: shown, differing })
  }
  return result
}
