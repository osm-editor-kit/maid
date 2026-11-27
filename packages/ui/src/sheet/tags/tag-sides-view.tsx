/**
 * The sides view of the Tags sheet as one sheet (tag-sides.ts has the logic): its columns, the merged value cell of
 * the rows with no side, the headline of each group and the copy of its rows. The rows with no side come first, with
 * the empty row; each group follows under a tinted headline that names it and the two sides.
 */
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import type { Combined } from '../../inspector/fields/shared.ts'
import type { ColId, SheetColumn, SheetRow } from '../types.ts'
import { serializeTagCells } from './tag-paste.ts'
import {
  copySideRow,
  isSideRow,
  SIDE_TOKEN,
  sideRowId,
  sideSheetRows,
  type SideGroupRows,
} from './tag-sides.ts'
import type { ReadOnlyKeys } from './tags.ts'

/** A row of the value cell that spans the right column: the rows with no side, and the rows the sheet makes */
export const VALUE_SPANS: Record<ColId, ColId> = { right: 'value' }

/** The short form of a group's name in its keys (Tobias, 2026-11-27: a hint of the group, not only "…") */
const GROUP_SHORT: Record<string, string> = { cycleway: 'cw', sidewalk: 'sw', parking: 'pk' }

/**
 * A pattern key with its side as an italic word: `cycleway:{side}:width` reads "cycleway:side:width". In a group that
 * does not fit (`short`), the group's name is cut short (the headline names it): "cw…:side:width", and
 * `source:cycleway:{side}:width` reads "source:cw…:side:width". The edit and the tooltip show the whole key. Other
 * keys as they are.
 */
function renderPattern(text: string, short: ReadonlySet<string>): ReactNode | undefined {
  const [before = '', after] = text.split(SIDE_TOKEN)
  if (after === undefined) return undefined
  const parts = before.split(':')
  const group = parts.length >= 2 ? parts[parts.length - 2] : undefined
  const at = group === undefined ? -1 : before.lastIndexOf(group)
  return (
    <>
      {at < 0 ? before : before.slice(0, at)}
      {at < 0 ? null : (
        <span className="text-zinc-400 dark:text-zinc-500">
          {group !== undefined && short.has(group)
            ? `${GROUP_SHORT[group] ?? ''}…${before.slice(at + group.length)}`
            : before.slice(at)}
        </span>
      )}
      <i className="text-violet-600 dark:text-violet-400">side</i>
      {after}
    </>
  )
}

/**
 * The columns of the sides view from the Tags sheet's two: the key (half the width, patterns drawn with their side),
 * the value (the left side in a group row) and `right`, a copy of the value column for the right side.
 */
export function sidesColumns(
  columns: readonly SheetColumn[],
  /** The groups whose keys show the group's name cut short (useShortGroups) */
  short: ReadonlySet<string> = new Set(),
): SheetColumn[] {
  const key = columns.find((column) => column.id === 'key')
  const value = columns.find((column) => column.id === 'value')
  if (key === undefined || value === undefined) return [...columns]
  return [
    { ...key, width: 'minmax(0,2fr)', display: (text) => renderPattern(text, short) },
    { ...value, width: 'minmax(0,1fr)' },
    { ...value, id: 'right', header: 'right', width: 'minmax(0,1fr)' },
  ]
}

/** The rows of the groups, one after the other */
export function groupSheetRows(
  groups: readonly SideGroupRows<string | Combined>[],
  readOnlyKey?: ReadOnlyKeys,
): SheetRow[] {
  return groups.flatMap((group) =>
    sideSheetRows(group.rows, group.group, readOnlyKey, group.common),
  )
}

/** The headline above the first row of each group: its name over the keys, the two sides over their columns */
export function groupHeadings(
  groups: readonly SideGroupRows<unknown>[],
): (row: SheetRow) => Partial<Record<ColId, ReactNode>> | undefined {
  const firsts = new Map<string, string>()
  for (const group of groups) {
    const first = group.rows[0]
    if (first !== undefined) firsts.set(sideRowId(first.pattern), group.group)
  }
  return (row) => {
    const group = firsts.get(row.id)
    if (group === undefined) return undefined
    return {
      key: <span className="font-mono tracking-wide uppercase">{group}</span>,
      value: <span className="font-mono">left</span>,
      right: <span className="font-mono">right</span>,
    }
  }
}

/** A copy in the sides view: `key=value` lines, a group row's sides as their own keys */
export function serializeSides(rows: readonly SheetRow[], cols: readonly ColId[]): string {
  return rows
    .flatMap((row) =>
      isSideRow(row.id)
        ? copySideRow(row, cols)
        : // a row with no side has one value cell over both side columns: either column is its value
          [
            serializeTagCells(
              [row],
              [...new Set(cols.map((col) => (col === 'right' ? 'value' : col)))],
            ),
          ],
    )
    .filter((line) => line !== '')
    .join('\n')
}

/** The cell's side padding (px-1.5 twice), in pixels */
const CELL_PADDING_PX = 12

/**
 * The groups whose keys would wrap in the key column at the sheet's width: those show their group's name cut short
 * ("cw…"), the others in full (Tobias, 2026-11-27: cut only as much as needed so a group's keys fit on one line; below
 * the short form they wrap). The key column is half the sheet (`sidesColumns`); a key is monospace,
 * so its width is its length times the width of one character, measured once in the sheet's own font.
 */
export function useShortGroups(
  root: RefObject<HTMLElement | null>,
  groups: readonly SideGroupRows<unknown>[],
): ReadonlySet<string> {
  const [room, setRoom] = useState<{ width: number; char: number }>()
  useEffect(() => {
    const element = root.current
    if (element === null || typeof ResizeObserver === 'undefined') return
    const probe = document.createElement('span')
    probe.className = 'font-mono text-xs'
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre'
    probe.textContent = 'x'.repeat(20)
    element.append(probe)
    const char = probe.getBoundingClientRect().width / 20
    probe.remove()
    const observer = new ResizeObserver(([entry]) => {
      if (entry !== undefined) setRoom({ width: entry.contentRect.width, char })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [root])
  if (room === undefined || room.char === 0) return new Set()
  const keyColumn = room.width / 2 - CELL_PADDING_PX
  const fits = keyColumn / room.char
  const short = new Set<string>()
  for (const group of groups) {
    const longest = Math.max(
      ...group.rows.map((row) => row.pattern.replace(SIDE_TOKEN, 'side').length),
    )
    if (longest > fits) short.add(group.group)
  }
  return short
}
