import { useMap } from 'react-map-gl/maplibre'

const BUTTON = 'grid size-9 place-items-center bg-neutral-800/90 text-lg text-white hover:bg-neutral-700'

export function ZoomControls() {
  const { mainMap } = useMap()
  return (
    <div className="absolute top-2 right-2 flex flex-col overflow-hidden rounded-md shadow">
      <button type="button" aria-label="Zoom in" className={BUTTON} onClick={() => mainMap?.zoomIn()}>
        +
      </button>
      <button type="button" aria-label="Zoom out" className={BUTTON} onClick={() => mainMap?.zoomOut()}>
        −
      </button>
    </div>
  )
}
