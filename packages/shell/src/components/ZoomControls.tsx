import { MinusIcon, PlusIcon } from '@heroicons/react/20/solid'
import { device } from '@osm-editor-kit/maid-i18n'
import { ControlButton, ControlGroup, MapControls, useBearing } from '@osm-editor-kit/maid-ui'
import { useMap } from 'react-map-gl/maplibre'
import { useShell } from '../shell-context'

/** The controls on the map, top right: zoom, and the compass while the map is turned */
export function ZoomControls() {
  const { mainMap } = useMap()
  const { engine } = useShell()
  const bearing = useBearing()
  return (
    <MapControls>
      <ControlGroup label="Map">
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
        {bearing !== 0 && (
          <ControlButton
            label={device().input === 'touch' ? 'Reset north' : 'Reset north (N)'}
            icon={<NorthNeedle bearing={bearing} />}
            onClick={() => engine.resetNorth()}
          />
        )}
      </ControlGroup>
    </MapControls>
  )
}

/** A needle that points at north on the screen: it turns against the bearing, as the map does */
function NorthNeedle(props: { bearing: number }) {
  return (
    <svg viewBox="0 0 20 20" style={{ transform: `rotate(${-props.bearing}deg)` }}>
      <path d="M10 2.5 13.5 10h-7z" className="fill-red-600" />
      <path d="M10 17.5 13.5 10h-7z" className="fill-zinc-400 dark:fill-zinc-500" />
    </svg>
  )
}
