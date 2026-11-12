import type { Editor } from '@osm-editor-kit/maid-core'
import type { DockViewProps } from '@osm-editor-kit/maid-ui'
import { useMemo, useSyncExternalStore } from 'react'
import { type GraphLike, type HoleRow, type Missing, scorecard } from './holes.ts'
import { m } from './messages.ts'

/** The history's staging graph, read again after a load, an edit, undo or redo */
function useStagingGraph(editor: Editor) {
  return useSyncExternalStore(
    (listener) => {
      const offs = [
        editor.history.on('merge', listener),
        editor.history.on('stagingchange', listener),
        editor.history.on('stablechange', listener),
        editor.history.on('historyjump', listener),
      ]
      return () => offs.forEach((off) => off())
    },
    () => editor.history.staging.graph,
  )
}

function missingText(row: HoleRow, item: Missing) {
  if (item === 'ref') return m.holes_missing_ref()
  if (item === 'par') return m.holes_missing_par()
  if (item === 'handicap') return m.holes_missing_handicap()
  return m.holes_duplicate({ ref: row.ref ?? '' })
}

const CELL = 'px-2 py-1 text-left'

/**
 * The dock view "Holes": the scorecard of the loaded data, one row per golf=hole with number, par, handicap, length and
 * what is missing. Choosing a row selects the hole; the pointer on a row marks it on the map.
 */
export function HolesView({ editor, select, selected, highlight }: DockViewProps) {
  const graph = useStagingGraph(editor)
  // the staging graph is a new object per change, so it is the memo's key
  const card = useMemo(() => scorecard(graph as unknown as GraphLike), [graph])
  if (card.rows.length === 0)
    return <p className="p-3 text-sm text-zinc-600 dark:text-zinc-300">{m.holes_empty()}</p>
  const courses = new Set(card.rows.map((row) => row.course ?? ''))
  return (
    <div className="flex flex-col gap-2 p-3 text-sm" data-golf-holes={card.rows.length}>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.holes_help()}</p>
      <table className="w-full max-w-2xl tabular-nums">
        <thead className="text-xs text-zinc-500 dark:text-zinc-400">
          <tr>
            {courses.size > 1 && <th className={CELL}>{m.holes_course()}</th>}
            <th className={CELL}>{m.holes_col_hole()}</th>
            <th className={CELL}>{m.holes_col_par()}</th>
            <th className={CELL}>{m.holes_col_handicap()}</th>
            <th className={`${CELL} text-right`}>{m.holes_col_length()}</th>
            <th className={CELL}>{m.holes_col_state()}</th>
          </tr>
        </thead>
        <tbody>
          {card.rows.map((row) => {
            const isSelected = selected.includes(row.id)
            const open = row.missing.filter((item) => item !== 'handicap')
            return (
              <tr
                key={row.id}
                data-hole={row.ref ?? ''}
                tabIndex={0}
                aria-selected={isSelected}
                onClick={() => select(row.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    select(row.id)
                  }
                }}
                onPointerEnter={() => highlight([row.id])}
                onPointerLeave={() => highlight(null)}
                onFocus={() => highlight([row.id])}
                onBlur={() => highlight(null)}
                className={`cursor-pointer border-t border-zinc-950/5 hover:bg-zinc-950/5 dark:border-white/5 dark:hover:bg-white/5 ${
                  isSelected ? 'bg-blue-50 dark:bg-blue-950/40' : ''
                }`}
              >
                {courses.size > 1 && <td className={CELL}>{row.course ?? ''}</td>}
                <td className={`${CELL} font-semibold`}>{row.ref ?? '–'}</td>
                <td className={CELL}>{row.par ?? '–'}</td>
                <td className={CELL}>{row.handicap ?? '–'}</td>
                <td className={`${CELL} text-right`}>{row.length} m</td>
                <td
                  className={`${CELL} text-xs ${
                    open.length > 0
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {row.missing.length === 0
                    ? m.holes_complete()
                    : row.missing.map((item) => missingText(row, item)).join(', ')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs font-medium">
        {m.holes_total({
          count: String(card.rows.length),
          par: String(card.par),
          length: String(card.length),
        })}
      </p>
    </div>
  )
}
