import { config } from '../editor'
import { useCameraParam } from '../url/state'

/**
 * What the map has to say for itself, drawn on it: a hint when it is too far out to load data,
 * and where the data comes from (the attribution OpenStreetMap asks for).
 */
export function MapNotices() {
  const [camera] = useCameraParam()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const belowDataZoom = zoom !== undefined && zoom < config.minDataZoom
  return (
    <>
      {belowDataZoom && (
        <p
          role="status"
          className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-900 shadow ring-1 ring-amber-900/10 dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-200/20"
        >
          Zoom in to load data
        </p>
      )}
      <p className="absolute right-0 bottom-0 rounded-tl-md bg-white/80 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
        © OpenStreetMap contributors
      </p>
    </>
  )
}
