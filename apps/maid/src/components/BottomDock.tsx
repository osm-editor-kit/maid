import { Dock } from '@osm-editor-kit/maid-ui'
import { config, useEngine } from '../editor'

/** What is loaded: entities by type, and where they come from */
function LoadedData() {
  const { nodes, ways, relations } = useEngine((e) => e.data.counts())
  const rows: [label: string, value: string][] = [
    ['Nodes', nodes.toLocaleString('en')],
    ['Ways', ways.toLocaleString('en')],
    ['Relations', relations.toLocaleString('en')],
    ['Source', config.live ? 'OSM API (live)' : `Fixture “${config.scene}”, local mock API`],
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

/** The dock under the map. Closed at first; its views become an extension point later. */
export function BottomDock() {
  return <Dock tabs={[{ id: 'data', label: 'Data', content: <LoadedData /> }]} />
}
