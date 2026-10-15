import type { CellState } from './cell-state.ts'
import { EDITED_BAR_CLASS, LEGEND_STATES, toneOf } from './cell-tone.ts'
import { m } from './messages.ts'

function legendLabel(state: CellState): string {
  switch (state) {
    case 'reference':
      return m.way_table_legend_reference()
    case 'different':
      return m.way_table_legend_different()
    case 'added':
      return m.way_table_legend_added()
    case 'missing':
      return m.way_table_legend_missing()
    case 'empty':
      return m.way_table_legend_empty()
    case 'same':
      return ''
  }
}

/** One line of chips: each state with its fill, mark or border, as the cells show them */
export function WayTableLegend({ edited }: { readonly edited: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-1 text-xs" aria-label="Legend">
      {LEGEND_STATES.map((state) => {
        const tone = toneOf(state)
        return (
          <li
            key={state}
            className={`relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-900 dark:text-zinc-100 ${tone.cell} ${tone.dashed ? 'border border-dashed border-red-400 dark:border-red-700' : ''}`}
          >
            {tone.mark ? (
              <span aria-hidden className="font-bold">
                {tone.mark}
              </span>
            ) : null}
            {state === 'empty' ? (
              <span aria-hidden className="text-zinc-400">
                —
              </span>
            ) : null}
            <span>{legendLabel(state)}</span>
          </li>
        )
      })}
      {edited ? (
        <li className="relative inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-zinc-900 dark:text-zinc-100">
          <span aria-hidden className={`absolute inset-x-1 bottom-0 h-[3px] ${EDITED_BAR_CLASS}`} />
          {m.way_table_legend_edited()}
        </li>
      ) : null}
    </ul>
  )
}
