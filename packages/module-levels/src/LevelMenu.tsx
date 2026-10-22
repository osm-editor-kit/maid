import { CursorArrowRaysIcon } from '@heroicons/react/16/solid'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { ControlGroup, Tooltip } from '@osm-editor-kit/maid-ui'
import type { MapMouseEvent } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMap } from 'react-map-gl/maplibre'
import { twMerge } from 'tailwind-merge'
import {
  EDITED_REASON,
  isRecommended,
  type LevelSuggestion,
  pointInPolygon,
  suggestLevels,
  withLevelsInView,
} from './level-suggestions.ts'
import { buttonClass } from './look.ts'

/** `fixing`: opened while the features without a level are edited ("none"), where the click also selected the feature */
type Menu = {
  at: { x: number; y: number }
  id: string
  suggestions: LevelSuggestion[]
  fixing: boolean
} | null

/** The menu's width (w-20, 80 px) and a gap: it opens left of the pointer */
const MENU_OFFSET = 88

/** The position of a feature (a node's loc, a way's average node) and the nodes it is made of */
function placeOf(
  engine: MaidEngine,
  id: string,
): { position: [number, number]; nodeIds: string[] } | undefined {
  const node = engine.data.node(id)
  if (node) {
    const loc = node.loc
    return loc ? { position: [loc[0], loc[1]], nodeIds: [id] } : undefined
  }
  const way = engine.data.way(id)
  if (!way) return undefined
  let x = 0
  let y = 0
  let count = 0
  for (const nodeId of way.nodes) {
    const loc = engine.data.node(nodeId)?.loc
    if (!loc) continue
    x += loc[0]
    y += loc[1]
    count += 1
  }
  if (count === 0) return undefined
  return { position: [x / count, y / count], nodeIds: [...way.nodes] }
}

/** The closed indoor areas with a level that contain the position: their level and a name for the reason text */
function enclosingAreas(engine: MaidEngine, position: [number, number]) {
  const areas: { id: string; value: string; name: string }[] = []
  for (const way of engine.data.all().ways) {
    const tags = way.tags
    if (!tags) continue
    const indoor = tags.indoor
    const level = tags.level
    if (!indoor || !level) continue
    const nodeIds = way.nodes
    if (nodeIds.length === 0 || nodeIds[0] !== nodeIds[nodeIds.length - 1]) continue
    const ring: [number, number][] = []
    for (const nodeId of nodeIds) {
      const loc = engine.data.node(nodeId)?.loc
      if (loc) ring.push([loc[0], loc[1]])
    }
    if (ring.length === 0 || !pointInPolygon(position, ring)) continue
    areas.push({ id: way.id, value: level, name: tags.name ?? indoor })
  }
  return areas
}

/**
 * The levels to offer for a feature: the suggestions of its surroundings (level-suggestions.ts) with the edited level,
 * and every other level in view, highest first. Undefined for a feature that is not loaded. Also used by the
 * inspector's level section.
 */
export function levelOffersFor(engine: MaidEngine, id: string): LevelSuggestion[] | undefined {
  const suggested = nearbySuggestionsFor(engine, id)
  if (!suggested) return undefined
  return withLevelsInView(
    suggested,
    engine.map?.queryRenderedFeatures().map((feature) => feature.id) ?? [],
    (other) => engine.levelsOf(other),
  )
}

/**
 * Only what the feature's surroundings suggest (connected ways, the rooms it is in, the ends of stairs) and the edited
 * level, without the levels in view: cheap enough for a render (the inspector's "Use 0 → 1").
 */
export function nearbySuggestionsFor(
  engine: MaidEngine,
  id: string,
): LevelSuggestion[] | undefined {
  const place = placeOf(engine, id)
  if (!place) return undefined
  const level = engine.level
  return suggestLevels({
    id,
    nodeIds: place.nodeIds,
    edited: typeof level === 'number' ? level : null,
    waysOfNode: (node) => engine.data.nodeWays.get(node) ?? [],
    tagsOf: (other) => (engine.data.node(other) ?? engine.data.way(other))?.tags,
    enclosing: enclosingAreas(engine, place.position),
  })
}

/**
 * While a level is edited, a click on a feature that has no level and is off that level offers the levels it could
 * get (level-suggestions.ts): a menu at the pointer, one row per suggestion, and "Select anyway".
 */
export function LevelMenu({ engine }: { engine: MaidEngine }) {
  const { current: map } = useMap()
  const [menu, setMenu] = useState<Menu>(null)

  useEffect(
    function offerLevelsOnClick() {
      if (!map) return
      const onClick = (event: MapMouseEvent) => {
        const level = engine.level
        if (level === null) return
        // on a level: a feature without a level is locked, the menu is the way to put it on one; while the features
        // without a level are edited ("none"), the click selects it as usual and the menu comes next to it
        const fixing = level === 'none'
        // a few pixels around the click, as the picking of a thin line needs
        const { x, y } = event.point
        const features = map.queryRenderedFeatures([
          [x - 6, y - 6],
          [x + 6, y + 6],
        ])
        const ids = new Set<string>()
        for (const feature of features) if (typeof feature.id === 'string') ids.add(feature.id)
        let picked: string | undefined
        for (const id of ids) {
          const entity = engine.data.node(id) ?? engine.data.way(id)
          if (!entity?.tags || Object.keys(entity.tags).length === 0) continue
          if (engine.levelsOf(id).length !== 0) continue
          if (!fixing && !engine.isOffLevel(id)) continue
          picked = id
          break
        }
        if (!picked) return
        const suggestions = levelOffersFor(engine, picked)
        if (!suggestions) return
        // left of the pointer, so that the menu of a right click still has its place on the right
        setMenu({
          at: { x: event.originalEvent.clientX - MENU_OFFSET, y: event.originalEvent.clientY },
          id: picked,
          suggestions,
          fixing,
        })
      }
      map.on('click', onClick)
      return () => {
        map.off('click', onClick)
      }
    },
    [engine, map],
  )

  if (!menu) return null
  const close = () => {
    setMenu(null)
    engine.hoverLevel(null)
  }
  const { id, at, suggestions, fixing } = menu
  return (
    <SetLevelMenu
      engine={engine}
      at={at}
      suggestions={suggestions}
      onChoose={(suggestion) => {
        engine.assignLevel(id, suggestion.value, suggestion.incline)
        // while fixing, a feature with a level leaves the view (only features without one show)
        engine.setSelected(fixing ? null : id)
      }}
      onSelect={fixing ? undefined : () => engine.setSelected(id)}
      onClose={close}
    />
  )
}

/**
 * The offers as a small column of levels in the order and the look of the level picker: the edited level in the current
 * look, the levels suggested by the feature's surroundings in bold, the reasons ("connected: 2 corridors") in each
 * level's tooltip, and the pointer on one shows that level on the map. "Select" at the end selects the feature as it
 * is (read-only while it is locked). Escape, a left click outside or a choice closes it; a right click does not.
 */
export function SetLevelMenu({
  engine,
  at,
  suggestions,
  onChoose,
  onSelect,
  onClose,
}: {
  engine: MaidEngine
  /** Window pixels of the menu's top left corner (it opens there, kept 4 px inside the window) */
  at: { x: number; y: number }
  suggestions: readonly LevelSuggestion[]
  onChoose: (suggestion: LevelSuggestion) => void
  /** "Select" at the end, when the feature is not selected yet */
  onSelect?: () => void
  onClose: () => void
}) {
  const frame = useRef<HTMLDivElement>(null)
  useEffect(
    function closeOnEscapeOrOutside() {
      frame.current?.querySelector('button')?.focus()
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') onClose()
      }
      // a right click (the edit menu) leaves it open beside that menu; a left click elsewhere closes it
      const onPress = (event: PointerEvent) => {
        if (event.button === 0 && !frame.current?.contains(event.target as Node)) onClose()
      }
      document.addEventListener('keydown', onKey)
      document.addEventListener('pointerdown', onPress, true)
      return () => {
        document.removeEventListener('keydown', onKey)
        document.removeEventListener('pointerdown', onPress, true)
      }
    },
    [onClose],
  )
  return createPortal(
    <div
      ref={frame}
      role="menu"
      aria-label="Set level"
      className="fixed z-50"
      style={{ left: Math.max(4, at.x), top: Math.max(4, at.y - 18) }}
    >
      <ControlGroup label="Set level" className="w-20 shadow-lg">
        {suggestions.map((suggestion) => {
          const { value } = suggestion
          // a range such as "0;1" previews its first level
          const preview = Number(value.split(';')[0])
          const current = suggestion.reasons.includes(EDITED_REASON)
          return (
            <Tooltip key={value} label={suggestion.reasons.join(' · ')} placement="left">
              <button
                type="button"
                role="menuitem"
                data-level={value}
                onPointerEnter={() => engine.hoverLevel(Number.isFinite(preview) ? preview : null)}
                onPointerLeave={() => engine.hoverLevel(null)}
                // the keyboard's focus shows a level too, but not the focus the menu gets when it opens: the map
                // changes only when the person points at a level
                onFocus={(event) => {
                  if (event.currentTarget.matches(':focus-visible'))
                    engine.hoverLevel(Number.isFinite(preview) ? preview : null)
                }}
                onBlur={() => engine.hoverLevel(null)}
                onClick={() => {
                  onChoose(suggestion)
                  onClose()
                }}
                className={twMerge(
                  buttonClass(current),
                  'w-full',
                  isRecommended(suggestion) ? 'font-bold' : 'font-normal',
                )}
              >
                {value}
              </button>
            </Tooltip>
          )
        })}
        {onSelect && (
          <Tooltip label="Select it as it is (read-only)" placement="left">
            <button
              type="button"
              role="menuitem"
              aria-label="Select anyway"
              onClick={() => {
                onSelect()
                onClose()
              }}
              className={twMerge(buttonClass(false), 'w-full')}
            >
              <CursorArrowRaysIcon aria-hidden="true" className="size-4" />
            </button>
          </Tooltip>
        )}
      </ControlGroup>
    </div>,
    document.body,
  )
}
