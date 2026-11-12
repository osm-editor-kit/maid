import { isAutomated, type UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useMap } from 'react-map-gl/maplibre'
import { m } from './messages.ts'
import { EXAGGERATIONS, MAPTERHORN, MAX_PITCH, type TerrainMode, useTerrain } from './terrain.ts'
import { useTerrainMode } from './TerrainLayers.tsx'

const MODES: TerrainMode[] = ['off', 'relief', '3d']

function modeLabel(mode: TerrainMode) {
  if (mode === 'relief') return m.terrain_mode_relief()
  if (mode === '3d') return m.terrain_mode_3d()
  return m.terrain_mode_off()
}

/**
 * The top bar's "Terrain": off, relief or 3D, the height scale and the tilt in 3D, and the notice on the source. The
 * notice is always shown while terrain is on: Mapterhorn mixes sources, and not all of them are known to be compatible
 * with the ODbL (docs/research/climbing.md, "Terrain").
 */
export function TerrainPanel({ handle }: { handle: UrlParamHandle<TerrainMode> }) {
  const [mode, setMode] = useTerrainMode(handle)
  const exaggeration = useTerrain((state) => state.exaggeration)
  const setExaggeration = useTerrain((state) => state.setExaggeration)
  const maps = useMap()
  const map = maps.mainMap ?? maps.current
  const tilt = (pitch: number) => map?.getMap().easeTo({ pitch, duration: 500 })
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div role="radiogroup" aria-label={m.terrain_label()} className="flex gap-1">
        {MODES.map((item) => (
          <button
            key={item}
            type="button"
            role="radio"
            aria-checked={mode === item}
            onClick={() => setMode(item)}
            className={
              mode === item
                ? 'flex-1 rounded-md bg-blue-600 px-2 py-1.5 font-medium text-white'
                : 'flex-1 rounded-md bg-zinc-100 px-2 py-1.5 text-zinc-800 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700'
            }
          >
            {modeLabel(item)}
          </button>
        ))}
      </div>
      {isAutomated() ? <p className="text-zinc-500">{m.terrain_automated()}</p> : null}
      {mode === '3d' ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-zinc-600 dark:text-zinc-300">
              {m.terrain_heights()}
            </span>
            {EXAGGERATIONS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={exaggeration === value}
                onClick={() => setExaggeration(value)}
                className={
                  exaggeration === value
                    ? 'rounded bg-blue-600 px-2 py-0.5 text-white tabular-nums'
                    : 'rounded bg-zinc-100 px-2 py-0.5 tabular-nums hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
                }
              >
                {`×${value}`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-zinc-600 dark:text-zinc-300">
              {m.terrain_tilt()}
            </span>
            {[0, 30, 45, MAX_PITCH].map((pitch) => (
              <button
                key={pitch}
                type="button"
                onClick={() => tilt(pitch)}
                className="rounded bg-zinc-100 px-2 py-0.5 tabular-nums hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              >
                {`${pitch}°`}
              </button>
            ))}
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.terrain_tilt_hint()}</p>
        </div>
      ) : null}
      {mode !== 'off' ? (
        <div
          role="note"
          className="rounded-md bg-amber-50 p-2.5 text-xs text-amber-900 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-800"
        >
          <p className="font-medium">{m.terrain_notice_title()}</p>
          <p className="mt-1">{m.terrain_notice_text()}</p>
          <a
            className="mt-1 inline-block underline"
            href={MAPTERHORN.attributionUrl}
            target="_blank"
            rel="noreferrer"
          >
            {m.terrain_notice_link()}
          </a>
        </div>
      ) : (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.terrain_off_hint()}</p>
      )}
    </div>
  )
}
