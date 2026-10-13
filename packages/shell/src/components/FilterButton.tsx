import { FunnelIcon } from '@heroicons/react/20/solid'
import { createFilterSet } from '@osm-editor-kit/maid-filters'
import { FilterPanel, Flyout, toolButtonClass, Tooltip, useSettings } from '@osm-editor-kit/maid-ui'
import { useEngine, useShell } from '../shell-context'
import { differsFromStored, writesFor } from '../url/shown'
import { useFiltersParam } from '../url/state'

const LINK_BUTTON =
  'cursor-pointer rounded-sm font-medium text-zinc-950 underline hover:no-underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white'

/**
 * What is editable, read-only or hidden. The states are the engine's; the URL keeps what differs.
 * A change is written to the URL and stored as the person's own choice. While the filters shown
 * differ from the stored choice, they come from a link: one quiet row at the top says so, and
 * "Use mine" goes back to the stored choice.
 */
function Filters() {
  const { editor, engine, normalizeFilters } = useShell()
  const [, setParam] = useFiltersParam()
  const filters = useEngine((e) => e.filters)
  const hidden = useEngine((e) => ({ ...e.hiddenCounts() }))
  const stored = useSettings((s) => s.shown.filters)
  if (editor.filters.length === 0)
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">This editor has no filters.</p>
    )
  const fromLink = differsFromStored(filters.toParam(), stored, '', normalizeFilters)
  const apply = (param: string) => {
    engine.setFilters(createFilterSet(editor.filters, param))
    void setParam(writesFor(param).url)
  }
  return (
    <>
      {fromLink && (
        <p className="flex flex-wrap items-center gap-x-3 px-4 pt-3 text-xs text-zinc-500 dark:text-zinc-400">
          <span>These filters come from the link.</span>
          <button type="button" className={LINK_BUTTON} onClick={() => apply(stored ?? '')}>
            Use mine
          </button>
        </p>
      )}
      <FilterPanel
        // the editor's own list: its states are the defaults that "changed" and "Reset" compare with
        filters={editor.filters}
        states={filters.states()}
        counts={hidden}
        onChange={(id, state) => {
          const change = writesFor(engine.filters.with(id, state).toParam())
          engine.setFilters(createFilterSet(editor.filters, change.stored))
          void setParam(change.url)
          useSettings.getState().setShown('filters', change.stored)
        }}
      />
    </>
  )
}

/**
 * The top bar's filter button. It opens the filters in a flyout and shows how many differ from
 * what the editor starts with. A small dot marks filters that come from a link and differ from
 * the stored choice.
 */
export function FilterButton() {
  const { editor, normalizeFilters } = useShell()
  const shown = useEngine((e) => e.filters.toParam())
  const stored = useSettings((s) => s.shown.filters)
  if (editor.filters.length === 0) return null
  const changed = shown ? shown.split(',').length : 0
  const fromLink = differsFromStored(shown, stored, '', normalizeFilters)
  const base = changed > 0 ? `Filters, ${changed} changed` : 'Filters'
  return (
    <Flyout
      label="Filters"
      placement="bottom-end"
      className="w-[46rem]"
      trigger={
        <button
          type="button"
          aria-label={fromLink ? `${base}, from the link you opened` : base}
          title="Filters: what is editable, read-only or hidden"
          className={toolButtonClass(false, changed > 0)}
        >
          <FunnelIcon aria-hidden="true" className="size-5" />
          {changed > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-4 rounded-full bg-blue-600 px-1 text-center text-[10px] leading-4 font-semibold text-white tabular-nums ring-2 ring-white dark:ring-zinc-900">
              {changed}
            </span>
          )}
          {fromLink && (
            // on the corner opposite the count, in the style of the save button's dot
            <Tooltip label="From the link you opened">
              <span
                aria-label="From the link you opened"
                className="absolute -top-1 -left-1 size-2.5 rounded-full bg-blue-600 ring-2 ring-white dark:ring-zinc-900"
              />
            </Tooltip>
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
