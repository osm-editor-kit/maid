import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid'
import { ControlButton, ControlGroup, MapControls } from '@osm-editor-kit/maid-ui'
import { useMap } from 'react-map-gl/maplibre'

/** The controls on the map, top right. Only zoom for now. */
export function ZoomControls() {
  const { mainMap } = useMap()
  return (
    <MapControls>
      <ControlGroup label="Zoom">
        <ControlButton
          label="Zoom in"
          icon={<PlusIcon className="size-5" />}
          onClick={() => mainMap?.zoomIn()}
        />
        <ControlButton
          label="Zoom out"
          icon={<MinusIcon className="size-5" />}
          onClick={() => mainMap?.zoomOut()}
        />
      </ControlGroup>
    </MapControls>
  )
}
