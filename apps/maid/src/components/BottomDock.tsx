import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Dock, FilterPanel } from '@osm-editor-kit/maid-ui'
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

/** What is editable, read-only or hidden. The states are the engine's; the URL keeps what differs. */
function Filters() {
  const [, setParam] = useFiltersParam()
  const filters = useEngine((e) => e.filters)
  const hidden = useEngine((e) => ({ ...e.hiddenCounts() }))
  if (editor.filters.length === 0)
    return (
      <p className="p-3 text-xs text-zinc-500 dark:text-zinc-400">This editor has no filters.</p>
    )
  return (
    <FilterPanel
      // the editor's own list: its states are the defaults that "changed" and "Reset" compare with
      filters={editor.filters}
      states={filters.states()}
      counts={hidden}
      onChange={(id, state) => {
        const next = engine.filters.with(id, state)
        engine.setFilters(next)
        void setParam(next.toParam() || null)
      }}
    />
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
