import { toOsmZoom } from '@osm-editor-kit/maid-core'
import { floorsOf } from '@osm-editor-kit/maid-levels'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { ControlGroup, ROW_CURRENT } from '@osm-editor-kit/maid-ui'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { levelViewActions, useThreeD } from './view-store.ts'

/** From this OSM zoom on the picker shows, as MapComplete's floor selector does */
export const PICKER_MIN_ZOOM = 17

/** The OSM id of each queried feature: the builder makes it the entity id, a string such as `w123` (renderer feature-id.ts) */
export function idsInView(features: Iterable<{ id?: string | number }>): Set<string> {
  const ids = new Set<string>()
  for (const feature of features) if (typeof feature.id === 'string') ids.add(feature.id)
  return ids
}

/** The floors of the entities with these ids. An id the data does not know (a feature of another source) counts for nothing. */
export function floorsIn(
  ids: Iterable<string>,
  entityOf: (id: string) => { readonly tags: Readonly<Record<string, string>> } | undefined,
): number[] {
  function* entities() {
    for (const id of ids) {
      const entity = entityOf(id)
      if (entity) yield entity
    }
  }
  return floorsOf(entities())
}

/** The floors the list shows, highest first: the floors in view, and the chosen level even when no feature in view is on it */
export function floorChoices(floors: readonly number[], chosen: number | null): number[] {
  const all = new Set(floors)
  if (chosen !== null) all.add(chosen)
  return [...all].sort((a, b) => b - a)
}

/** Shown from OSM zoom 17, when the floors in view are more than the ground (0), or while a level is chosen */
export function levelPickerShown(
  zoom: number,
  floors: readonly number[],
  chosen: number | null,
): boolean {
  return zoom >= PICKER_MIN_ZOOM && (floors.length > 1 || chosen !== null)
}

/** The label of a level as OSM writes it: `-1.7`, `0`, `2` */
export function levelLabel(level: number): string {
  return String(level)
}

/** The status line while a level is chosen */
export function levelStatus(level: number): string {
  return `Editing level ${levelLabel(level)} · other levels dimmed and locked`
}

export function sameFloors(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((floor, i) => floor === b[i])
}

const BUTTON =
  'flex h-9 min-w-9 items-center justify-center px-2 text-sm font-medium tabular-nums text-zinc-950 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 pointer-coarse:h-10 pointer-coarse:min-w-10 dark:text-white'

function buttonClass(pressed: boolean): string {
  return `${BUTTON} ${pressed ? ROW_CURRENT : 'bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'}`
}

// The column sits in the middle of the map's right edge, as MapComplete's floor selector, between the zoom and compass
// buttons above (7rem leaves room for both) and the notices below; a long list of floors scrolls inside that space.
// The column itself lets the pointer through to the map, its controls take it.
const COLUMN =
  'pointer-events-none absolute top-28 right-2 bottom-12 z-10 flex flex-col items-end justify-center gap-2'

/**
 * The floor selector on the map's right edge: the floors of the features in view, highest at the top. Choosing one edits
 * on that level (engine.setLevel), choosing it again or "All" ends the level mode. "3D" turns the extrusion on and off.
 * The floors come from the map's rendered features, read once per animation frame at most, each time the map has
 * drawn everything (`idle`).
 */
export function LevelPicker({ engine }: { engine: MaidEngine }) {
  const level = useSyncExternalStore(engine.subscribe, () => engine.level)
  const threeD = useThreeD()
  const { current: map } = useMap()
  const [zoom, setZoom] = useState(0)
  const [floors, setFloors] = useState<number[]>([0])

  useEffect(
    function followTheFloorsInView() {
      if (!map) return
      let frame = 0
      const read = () => {
        frame = 0
        const osmZoom = toOsmZoom(map.getZoom())
        setZoom(osmZoom)
        // the query walks every rendered feature: it is asked for only where the picker can show
        if (osmZoom < PICKER_MIN_ZOOM) return
        const ids = idsInView(map.queryRenderedFeatures())
        const next = floorsIn(
          ids,
          (id) => engine.data.node(id) ?? engine.data.way(id) ?? engine.data.relation(id),
        )
        setFloors((previous) => (sameFloors(previous, next) ? previous : next))
      }
      const later = () => {
        if (!frame) frame = requestAnimationFrame(read)
      }
      // `idle`: the map has drawn what it was asked for (a move, new data, an edit), so the rendered features are the
      // ones in view; reading on the engine's change would query before the new tiles are drawn
      later()
      map.on('idle', later)
      return () => {
        map.off('idle', later)
        cancelAnimationFrame(frame)
      }
    },
    [engine, map],
  )

  if (!levelPickerShown(zoom, floors, level)) return null

  return (
    <div className={COLUMN}>
      <ControlGroup label="Building levels" className="pointer-events-auto min-h-0 overflow-y-auto">
        {floorChoices(floors, level).map((floor) => (
          <button
            key={floor}
            type="button"
            aria-pressed={level === floor}
            onClick={() => engine.setLevel(level === floor ? null : floor)}
            className={buttonClass(level === floor)}
          >
            {levelLabel(floor)}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={level === null}
          onClick={() => engine.setLevel(null)}
          className={buttonClass(level === null)}
        >
          All
        </button>
      </ControlGroup>
      {level !== null && (
        <p
          role="status"
          className="pointer-events-auto max-w-44 rounded-md bg-white px-2 py-1 text-right text-xs text-zinc-700 shadow-sm ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-200 dark:ring-white/10"
        >
          {levelStatus(level)}
        </p>
      )}
      <ControlGroup label="View" className="pointer-events-auto shrink-0">
        <button
          type="button"
          aria-pressed={threeD}
          onClick={() => levelViewActions.setThreeD(!threeD)}
          className={buttonClass(threeD)}
        >
          3D
        </button>
      </ControlGroup>
    </div>
  )
}
