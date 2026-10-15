import type { Graph } from '@osm-editor-kit/maid-model'
import type { WayChain } from './chain.ts'
import { m } from './messages.ts'
import { labelOf } from './table.ts'
import type { Direction } from './types.ts'
import { MAX_PER_SIDE_LIMIT, SHOW_MORE_STEP, type WayTableActions } from './way-table-store.ts'

export type WayTableEndProps = {
  readonly side: Direction
  readonly chain: WayChain
  readonly referenceId: string
  readonly graph: Graph
  readonly limit: number
  /** True for a line (a way): its junction can be chosen. An area's junction only stops the table. */
  readonly choosable: boolean
  readonly actions: WayTableActions
  readonly onHighlight: (ids: readonly string[] | null) => void
}

const CHIP =
  'inline-flex max-w-full items-center gap-1 rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-left text-xs text-zinc-900 hover:border-blue-500 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100'

/**
 * The end of a side, in the header row and the first or last column: why the chain stops there. A limit offers "Show
 * more"; a junction offers its candidates as buttons (a choice continues the chain through the chosen way).
 */
export function WayTableEnd(props: WayTableEndProps) {
  const { side, chain, referenceId, graph, limit, choosable, actions, onHighlight } = props
  const stop = chain.stops[side]
  const junction = chain.junctions.find((item) => item.direction === side)
  return (
    <div className="flex min-h-10 flex-col gap-1 text-xs">
      {stop === 'junction' && junction && choosable ? (
        <>
          <span className="font-medium text-zinc-700 dark:text-zinc-200">
            {m.way_table_junction()}
          </span>
          <div className="flex flex-wrap gap-1">
            {junction.candidates.map((id) => {
              const tags = graph.hasEntity(id)?.tags ?? {}
              return (
                <button
                  key={id}
                  type="button"
                  className={CHIP}
                  onClick={() => actions.choose(referenceId, junction.nodeId, id)}
                  onMouseEnter={() => onHighlight([id])}
                  onMouseLeave={() => onHighlight(null)}
                  onFocus={() => onHighlight([id])}
                  onBlur={() => onHighlight(null)}
                >
                  <span className="truncate">{labelOf(tags, id)}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-500">{id}</span>
                </button>
              )
            })}
          </div>
        </>
      ) : null}
      {stop === 'junction' && junction && !choosable ? (
        <span className="text-zinc-600 dark:text-zinc-300">{m.way_table_junction_area()}</span>
      ) : null}
      {stop === 'limit' && limit < MAX_PER_SIDE_LIMIT ? (
        <button
          type="button"
          className="self-start rounded-md border border-zinc-300 bg-white px-2 py-0.5 font-medium text-zinc-900 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-600 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
          onClick={() => actions.showMore(referenceId)}
        >
          {m.way_table_show_more({ count: SHOW_MORE_STEP })}
        </button>
      ) : null}
      {stop === 'end' ? (
        <span className="text-zinc-500 dark:text-zinc-400">{m.way_table_chain_ends()}</span>
      ) : null}
      {stop === 'unloaded' ? (
        <span className="text-zinc-500 dark:text-zinc-400">{m.way_table_data_ends()}</span>
      ) : null}
    </div>
  )
}
