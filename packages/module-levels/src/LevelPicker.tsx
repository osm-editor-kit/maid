import { EyeIcon, EyeSlashIcon, PencilIcon } from '@heroicons/react/16/solid'
import { toOsmZoom } from '@osm-editor-kit/maid-core'
import { floorsOf, levelState, type LevelState } from '@osm-editor-kit/maid-levels'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { ControlGroup, ROW_CURRENT, Tooltip } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
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

/** A level button's tooltip: what the level is now, in a word (the neighbouring buttons show the rest) */
export function levelTip(level: number, state: LevelState | undefined): string {
  const name = `Level ${levelLabel(level)}`
  if (state === 'edited') return `${name}: editing`
  if (state === 'shown') return `${name}: shown, locked`
  if (state === 'hidden') return `${name}: hidden`
  return name
}

/** The floors after a new reading: while the person works on a level or in 3D the list only grows, so it does not jump */
export function nextFloors(
  previous: readonly number[],
  read: readonly number[],
  keep: boolean,
): readonly number[] {
  if (!keep) return read
  const all = new Set([...previous, ...read])
  return all.size === previous.length ? previous : [...all].sort((a, b) => a - b)
}

export function sameFloors(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((floor, i) => floor === b[i])
}

const BUTTON =
  'flex h-9 min-w-9 items-center justify-center px-2 text-sm font-medium tabular-nums text-zinc-950 focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 pointer-coarse:h-10 pointer-coarse:min-w-10 dark:text-white'

function buttonClass(pressed: boolean): string {
  return `${BUTTON} ${pressed ? ROW_CURRENT : 'bg-white hover:bg-zinc-50 dark:bg-zinc-800 dark:hover:bg-zinc-700'}`
}

// The column hangs from the map's top left corner (the right edge has the zoom and compass buttons): "3D" first, then
// the floors, so a floor that comes or goes moves only what is below it. A long list scrolls above the notices.
// The column itself lets the pointer through to the map, its controls take it.
const COLUMN =
  'pointer-events-none absolute top-2 bottom-12 left-2 z-10 flex flex-col items-start gap-2'

/**
 * The floor selector at the map's top left: "3D", then the floors of the features in view, highest first. Choosing one
 * edits on that level (engine.setLevel); each floor then shows with an icon whether it is edited, shown and locked, or
 * hidden (levels shown.ts), and says it in its tooltip. Choosing it again or "All" ends the level mode.
 * The floors come from the map's rendered features, read once per animation frame at most, each time the map has
 * drawn everything (`idle`).
 */
export function LevelPicker({ engine }: { engine: MaidEngine }) {
  const level = useSyncExternalStore(engine.subscribe, () => engine.level)
  const threeD = useThreeD()
  const { current: map } = useMap()
  const [zoom, setZoom] = useState(0)
  const [floors, setFloors] = useState<number[]>([0])
  // 3D, read by the map's listener below without starting it again
  const keeping = useRef(threeD)
  useEffect(
    function keepTheFloorsIn3D() {
      keeping.current = threeD
    },
    [threeD],
  )

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
        const keep = engine.level !== null || keeping.current
        setFloors((previous) => {
          const floors = nextFloors(previous, next, keep)
          return sameFloors(previous, floors) ? previous : [...floors]
        })
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
      <ControlGroup label="View" className="pointer-events-auto shrink-0">
        <Tooltip label={threeD ? 'Flat map' : 'Levels in 3D'} placement="right">
          <button
            type="button"
            aria-pressed={threeD}
            onClick={() => levelViewActions.setThreeD(!threeD)}
            className={buttonClass(threeD)}
          >
            3D
          </button>
        </Tooltip>
      </ControlGroup>
      <ControlGroup label="Building levels" className="pointer-events-auto min-h-0 overflow-y-auto">
        {floorChoices(floors, level).map((floor) => {
          const state = level === null ? undefined : levelState(floor, level)
          return (
            <Tooltip key={floor} label={levelTip(floor, state)} placement="right">
              <button
                type="button"
                aria-pressed={state === 'edited'}
                data-level-state={state}
                onClick={() => engine.setLevel(state === 'edited' ? null : floor)}
                className={`${buttonClass(state === 'edited')} justify-between gap-1.5 ${state === 'hidden' ? 'text-zinc-400 dark:text-zinc-500' : ''}`}
              >
                <span>{levelLabel(floor)}</span>
                {state && <StateIcon state={state} />}
              </button>
            </Tooltip>
          )
        })}
        <Tooltip label="All levels" placement="right">
          <button
            type="button"
            aria-pressed={level === null}
            onClick={() => engine.setLevel(null)}
            className={buttonClass(level === null)}
          >
            All
          </button>
        </Tooltip>
      </ControlGroup>
    </div>
  )
}

/** What a level's button does to it while another is edited: pencil (edited), eye (in view, locked), crossed eye (hidden) */
function StateIcon({ state }: { state: LevelState }) {
  const Icon = state === 'edited' ? PencilIcon : state === 'shown' ? EyeIcon : EyeSlashIcon
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />
}
