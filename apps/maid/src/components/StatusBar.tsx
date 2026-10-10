import { useSyncExternalStore } from 'react'
import { config, engine } from '../editor'
import { useCameraParam } from '../url'

/** Bottom bar: zoom, what is loaded, where the data comes from */
export function StatusBar() {
  useSyncExternalStore(engine.subscribe, engine.getVersion)
  const [camera] = useCameraParam()
  const { nodes, ways, relations } = engine.store.counts()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const belowDataZoom = zoom !== undefined && zoom < config.minDataZoom
  return (
    <footer className="absolute right-0 bottom-0 left-0 flex h-8 items-center gap-4 bg-neutral-900/85 px-3 text-xs text-neutral-200">
      {zoom !== undefined && <span className="tabular-nums">Zoom {zoom.toFixed(1)}</span>}
      <span className="tabular-nums">
        {nodes.toLocaleString('en')} nodes, {ways.toLocaleString('en')} ways, {relations.toLocaleString('en')} relations
      </span>
      {belowDataZoom && <span className="text-amber-300">Zoom in to load data</span>}
      <span className="ml-auto">
        {config.live ? 'Live OSM data' : `Scene “${config.scene}” from the local mock API`} · © OpenStreetMap contributors
      </span>
    </footer>
  )
}
