import { writesStored } from '@osm-editor-kit/maid-core'
import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { createFilterSet } from '@osm-editor-kit/maid-filters'
import { Dock, FilterPanel, useSettings } from '@osm-editor-kit/maid-ui'
import { config, editor, engine, useEngine } from '../editor'
import { useSelection } from '../selection'
import { useCameraParam, useFiltersParam } from '../url/state'

/** What is loaded: entities by type, and where they come from */
function LoadedData() {
  const { nodes, ways, relations } = useEngine((e) => e.data.counts())
  const [camera] = useCameraParam()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const rows: [label: string, value: string][] = [
    ['Nodes', nodes.toLocaleString('en')],
    ['Ways', ways.toLocaleString('en')],
    ['Relations', relations.toLocaleString('en')],
    ['Source', config.live ? 'OSM API (live)' : `Fixture “${config.scene}”, local mock API`],
    ['Zoom', zoom === undefined ? '–' : zoom.toFixed(1)],
    ['Loads from zoom', String(config.minDataZoom)],
  ]
  return (
    <dl className="grid max-w-md grid-cols-[10rem_1fr] gap-x-4 gap-y-1 p-3 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
          <dd className="tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

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

/** The dock under the map, closed at first: the editor's own views, then those of modules (`dock.view`) */
export function BottomDock() {
  const views = useExtensionPoint(editor, 'dock.view')
  const { select } = useSelection()
  return (
    <Dock
      tabs={[
        { id: 'filters', label: 'Filters', content: <Filters /> },
        ...views.map((view) => ({
          id: view.id,
          label: view.label,
          content: <view.component editor={editor} select={select} />,
        })),
        { id: 'data', label: 'Data', content: <LoadedData /> },
      ]}
    />
  )
}
