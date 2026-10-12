import { FunnelIcon } from '@heroicons/react/20/solid'
import { writesStored } from '@osm-editor-kit/maid-core'
import { createFilterSet } from '@osm-editor-kit/maid-filters'
import { FilterPanel, Flyout, toolButtonClass, useSettings } from '@osm-editor-kit/maid-ui'
import { editor, engine, useEngine } from '../editor'
import { useFiltersParam } from '../url/state'

const LINK_BUTTON =
  'cursor-pointer rounded-sm font-medium underline hover:no-underline focus-visible:outline-2 focus-visible:outline-blue-500'

/**
 * What is editable, read-only or hidden. The states are the engine's; the URL keeps what differs.
 * A change is also stored as the user's own choice, unless the states came from a link: then it
 * stays in this session until the user takes their own back or keeps the link's.
 */
function Filters() {
  const [, setParam] = useFiltersParam()
  const filters = useEngine((e) => e.filters)
  const hidden = useEngine((e) => ({ ...e.hiddenCounts() }))
  const fromLink = useSettings((s) => s.fromLink.filters ?? false)
  const own = useSettings((s) => s.shown.filters ?? '')
  const { setShown, setFromLink } = useSettings.getState()
  if (editor.filters.length === 0)
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">This editor has no filters.</p>
    )
  const apply = (param: string) => {
    engine.setFilters(createFilterSet(editor.filters, param))
    void setParam(param || null)
  }
  return (
    <>
      {fromLink && (
        <p className="flex flex-wrap gap-x-3 bg-amber-50 px-3 py-1.5 text-xs text-amber-900 dark:bg-amber-400/10 dark:text-amber-200">
          <span>These filters come from the link you opened.</span>
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => {
              setFromLink('filters', false)
              apply(own)
            }}
          >
            Use mine
          </button>
          <button
            type="button"
            className={LINK_BUTTON}
            onClick={() => {
              setFromLink('filters', false)
              setShown('filters', engine.filters.toParam())
            }}
          >
            Keep these as mine
          </button>
        </p>
      )}
      <FilterPanel
        // the editor's own list: its states are the defaults that "changed" and "Reset" compare with
        filters={editor.filters}
        states={filters.states()}
        counts={hidden}
        onChange={(id, state) => {
          const param = engine.filters.with(id, state).toParam()
          apply(param)
          if (writesStored(fromLink)) setShown('filters', param)
        }}
      />
    </>
  )
}

/**
 * The top bar's filter button. It opens the filters in a flyout and shows how many differ from
 * what the editor starts with.
 */
export function FilterButton() {
  const changed = useEngine((e) =>
    e.filters.toParam() ? e.filters.toParam().split(',').length : 0,
  )
  if (editor.filters.length === 0) return null
  return (
    <Flyout
      label="Filters"
      placement="bottom-end"
      className="w-[46rem]"
      trigger={
        <button
          type="button"
          aria-label={changed > 0 ? `Filters, ${changed} changed` : 'Filters'}
          title="Filters: what is editable, read-only or hidden"
          className={toolButtonClass(false, changed > 0)}
        >
          <FunnelIcon aria-hidden="true" className="size-5" />
          {changed > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-white dark:ring-zinc-900">
              {changed}
            </span>
          )}
        </button>
      }
    >
      <div className="px-4 pt-4 pb-1">
        <h2 className="text-base font-semibold">Filters</h2>
        <p className="text-zinc-500 dark:text-zinc-400">
          Choose what you can edit, what is only shown, and what is hidden.
        </p>
      </div>
      <Filters />
    </Flyout>
  )
}
