import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Dock } from '@osm-editor-kit/maid-ui'
import { config, editor, useEngine } from '../editor'
import { useSelection } from '../selection'
import { useCameraParam } from '../url/state'

/** What is loaded: entities by type, and where they come from */
function LoadedData() {
  const { nodes, ways, relations } = useEngine((e) => e.data.counts())
  const [camera] = useCameraParam()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const rows: [label: string, value: string][] = [
    ['Nodes', nodes.toLocaleString('en')],
    ['Ways', ways.toLocaleString('en')],
    ['Relations', relations.toLocaleString('en')],
    [
      'Source',
      config.dev
        ? 'OSM development server (live)'
        : config.live
          ? 'OSM API (live)'
          : `Fixture “${config.scene}”, local mock API`,
    ],
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

/** The dock under the map, closed at first: the views of modules, then the editor's own (`dock.view`) */
export function BottomDock() {
  const views = useExtensionPoint(editor, 'dock.view')
  const { select } = useSelection()
  return (
    <Dock
      tabs={[
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
