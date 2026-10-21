import { EyeIcon, EyeSlashIcon, PencilIcon } from '@heroicons/react/16/solid'
import { toOsmZoom } from '@osm-editor-kit/maid-core'
import {
  type EditedLevel,
  floorsOf,
  levelState,
  type LevelState,
} from '@osm-editor-kit/maid-levels'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { ControlGroup, Flyout, ROW_CURRENT, Tooltip } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useMap } from 'react-map-gl/maplibre'
import { twMerge } from 'tailwind-merge'
import { buttonClass } from './look.ts'
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

/** How many features in view are on each level, and how many have no level. A feature without tags (a corner) does not count. */
export type LevelCounts = { byLevel: ReadonlyMap<number, number>; unleveled: number }

export function countLevels(
  ids: Iterable<string>,
  tagsOf: (id: string) => Readonly<Record<string, string>> | undefined,
  levelsOf: (id: string) => readonly number[],
): LevelCounts {
  const byLevel = new Map<number, number>()
  let unleveled = 0
  for (const id of ids) {
    const tags = tagsOf(id)
    if (!tags || Object.keys(tags).length === 0) continue
    const levels = levelsOf(id)
    if (levels.length === 0) unleveled++
    for (const level of levels) byLevel.set(level, (byLevel.get(level) ?? 0) + 1)
  }
  return { byLevel, unleveled }
}

/** A count in a small pill: `7`, `312`, `1.2k` */
export function countLabel(count: number): string {
  return count < 1000 ? String(count) : `${(count / 1000).toFixed(1).replace(/\.0$/, '')}k`
}

export function sameFloors(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((floor, i) => floor === b[i])
}

// The column hangs from the map's top left corner (the right edge has the zoom and compass buttons): "3D" first, then
// the floors, so a floor that comes or goes moves only what is below it. A long list scrolls above the notices.
// The column itself lets the pointer through to the map, its controls take it.
const COLUMN =
  'pointer-events-none absolute top-2 bottom-12 left-2 z-10 flex flex-col items-start gap-2'

/**
 * The floor selector at the map's top left: "3D", then the floors of the features in view, highest first, each with a
 * small count of its features in view, then "none" for the features without a level, then "All". Choosing a floor
 * edits on that level (engine.setLevel); each floor then shows with an icon whether it is edited, shown and locked, or
 * hidden (levels shown.ts). The "none" row opens a flyout: hide or show the features without a level next to the
 * edited one, or edit only them, to find and fix them. The pointer on a floor that shows makes its features stand out on the map.
 * The floors come from the map's rendered features, read once per animation frame at most, each time the map has
 * drawn everything (`idle`).
 */
export function LevelPicker({ engine }: { engine: MaidEngine }) {
  const level = useSyncExternalStore(engine.subscribe, () => engine.level)
  const unleveledVisible = useSyncExternalStore(engine.subscribe, () => engine.unleveledVisible)
  const threeD = useThreeD()
  const { current: map } = useMap()
  const [zoom, setZoom] = useState(0)
  const [floors, setFloors] = useState<number[]>([0])
  const [counts, setCounts] = useState<LevelCounts>({ byLevel: new Map(), unleveled: 0 })
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
        const read = countLevels(
          ids,
          (id) => (engine.data.node(id) ?? engine.data.way(id) ?? engine.data.relation(id))?.tags,
          (id) => engine.levelsOf(id),
        )
        setCounts(read)
        const next = [...new Set([0, ...read.byLevel.keys()])].sort((a, b) => a - b)
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

  const edited = typeof level === 'number' ? level : null
  if (!levelPickerShown(zoom, floors, level === 'none' ? 0 : edited)) return null

  // the pointer on a level that shows makes its features stand out; a hidden level has nothing to show
  const hover = (target: EditedLevel, state: LevelState | undefined) =>
    state === 'hidden'
      ? {}
      : {
          onPointerEnter: () => engine.hoverLevel(target),
          onPointerLeave: () => engine.hoverLevel(null),
          onFocus: () => engine.hoverLevel(target),
          onBlur: () => engine.hoverLevel(null),
        }
  const noneState: LevelState | undefined =
    level === null ? undefined : level === 'none' ? 'edited' : unleveledVisible ? 'shown' : 'hidden'

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
      <ControlGroup
        label="Building levels"
        className="pointer-events-auto min-h-0 w-24 overflow-y-auto"
      >
        {floorChoices(floors, edited).map((floor) => {
          const state =
            level === null ? undefined : level === 'none' ? 'hidden' : levelState(floor, level)
          return (
            <Tooltip key={floor} label={levelTip(floor, state)} placement="right">
              <button
                type="button"
                aria-pressed={state === 'edited'}
                data-level={floor}
                data-level-state={state}
                onClick={() => engine.setLevel(state === 'edited' ? null : floor)}
                {...hover(floor, state)}
                className={twMerge(
                  buttonClass(state === 'edited'),
                  ROW,
                  state === 'hidden' && HIDDEN_TEXT,
                )}
              >
                <span>{levelLabel(floor)}</span>
                <span className="flex items-center gap-1">
                  <CountPill count={counts.byLevel.get(floor) ?? 0} />
                  {state && <StateIcon state={state} />}
                </span>
              </button>
            </Tooltip>
          )
        })}
        {/* the features without a level: one row; its flyout (on hover, pinned by a click) holds the three choices */}
        <Flyout
          label="Features without a level"
          placement="right"
          hover
          className="w-56 p-1"
          trigger={
            <button
              type="button"
              aria-pressed={noneState === 'edited'}
              data-level="none"
              data-level-state={noneState}
              {...hover('none', noneState)}
              className={twMerge(
                buttonClass(noneState === 'edited'),
                ROW,
                noneState === 'hidden' && HIDDEN_TEXT,
              )}
            >
              <span>none</span>
              <span className="flex items-center gap-1">
                <CountPill count={counts.unleveled} />
                {noneState && <StateIcon state={noneState} />}
              </span>
            </button>
          }
        >
          <p className="px-2 pt-1 pb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            Features without a level ({countLabel(counts.unleveled)} in view)
          </p>
          <UnleveledChoice
            state="hidden"
            current={noneState === 'hidden'}
            disabled={typeof level !== 'number'}
            label="Hidden"
            onChoose={() => engine.setUnleveledVisible(false)}
          />
          <UnleveledChoice
            state="shown"
            current={noneState === 'shown'}
            disabled={typeof level !== 'number'}
            label="Shown, locked"
            onChoose={() => engine.setUnleveledVisible(true)}
          />
          <UnleveledChoice
            state="edited"
            current={noneState === 'edited'}
            label={noneState === 'edited' ? 'Stop editing them' : 'Edit only these'}
            onChoose={() => engine.setLevel(noneState === 'edited' ? null : 'none')}
          />
        </Flyout>
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

/** A floor's row: the number at the start, the count and the icon at the end, across the list's fixed width (w-24), so nothing moves when a count changes */
const ROW = 'w-full justify-between gap-1.5'
const HIDDEN_TEXT = 'text-zinc-400 dark:text-zinc-500'

/** One choice in the flyout of the "none" row; hidden and shown need a level that is edited */
function UnleveledChoice(props: {
  state: LevelState
  label: string
  current: boolean
  disabled?: boolean
  onChoose: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={props.current}
      data-unleveled-choice={props.state}
      disabled={props.disabled}
      onClick={props.onChoose}
      className={twMerge(
        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
        props.current ? ROW_CURRENT : 'hover:bg-zinc-950/5 dark:hover:bg-white/10',
        props.disabled && 'cursor-default text-zinc-400 hover:bg-transparent dark:text-zinc-500',
      )}
    >
      <StateIcon state={props.state} />
      {props.label}
    </button>
  )
}

/** How many features of a level are in view, as a small pill; nothing for none */
function CountPill({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="rounded-full bg-zinc-950/10 px-1 text-[10px] leading-4 font-normal tracking-tight tabular-nums dark:bg-white/15">
      {countLabel(count)}
    </span>
  )
}

/** What a level's button does to it while another is edited: pencil (edited), eye (in view, locked), crossed eye (hidden) */
function StateIcon({ state }: { state: LevelState }) {
  const Icon = state === 'edited' ? PencilIcon : state === 'shown' ? EyeIcon : EyeSlashIcon
  return <Icon aria-hidden="true" className="size-3.5 shrink-0" />
}
