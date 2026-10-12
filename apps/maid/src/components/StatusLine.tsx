import { StatusBar, StatusItem } from '@osm-editor-kit/maid-ui'
import { config } from '../editor'
import { useCameraParam } from '../url/state'

/** Bottom line: zoom, a hint when no data loads, where the data comes from */
export function StatusLine() {
  const [camera] = useCameraParam()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const belowDataZoom = zoom !== undefined && zoom < config.minDataZoom
  return (
    <StatusBar>
      {zoom !== undefined && <StatusItem>Zoom {zoom.toFixed(1)}</StatusItem>}
      {belowDataZoom && <StatusItem tone="warning">Zoom in to load data</StatusItem>}
      <StatusItem className="ml-auto">
        {config.live ? 'Live OSM data' : `Scene “${config.scene}” from the local mock API`} · ©
        OpenStreetMap contributors
      </StatusItem>
    </StatusBar>
  )
}
