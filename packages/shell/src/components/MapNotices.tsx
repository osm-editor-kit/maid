import { m } from '@osm-editor-kit/maid-i18n'
import { openSearch } from '../search/flyout'
import { useShell } from '../shell-context'
import { useCameraParam } from '../url/state'

/**
 * What the map has to say for itself, drawn on it: a hint when it is too far out to load data,
 * and where the data comes from (the attribution OpenStreetMap asks for).
 */
export function MapNotices() {
  const { config } = useShell()
  const [camera] = useCameraParam()
  const zoom = camera?.zoom ?? config.camera?.zoom
  const belowDataZoom = zoom !== undefined && zoom < config.minDataZoom
  return (
    <>
      {belowDataZoom && (
        <div className="absolute top-2 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-amber-100 py-1 pr-1 pl-3 text-xs font-medium text-amber-900 shadow ring-1 ring-amber-900/10 dark:bg-amber-400/20 dark:text-amber-200 dark:ring-amber-200/20">
          <p role="status" className="pointer-events-none">
            Zoom in to load data
          </p>
          <button
            type="button"
            onClick={() => openSearch()}
            className="cursor-pointer rounded-full bg-white/80 px-2.5 py-0.5 font-semibold text-amber-900 hover:bg-white focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-900/60 dark:text-amber-200 dark:hover:bg-zinc-900"
          >
            {m.search_place_button()}
          </button>
        </div>
      )}
      <p className="absolute right-0 bottom-0 rounded-tl-md bg-white/80 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-300">
        © OpenStreetMap contributors
      </p>
    </>
  )
}
