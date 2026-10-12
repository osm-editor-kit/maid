import { Square2StackIcon } from '@heroicons/react/16/solid'
import { ContextMenu, Tooltip, type MenuItem } from '@osm-editor-kit/maid-ui'
import { useEffect, useState } from 'react'
import { engine, useEngine } from '../editor'
import { useSelection } from '../selection'
import { keepsStack, useStack, type Stack } from '../stack'
import { PresetIcon } from './PresetIcon'

/** The pill sits up and to the right of the place it is for, so that it does not cover the feature */
const PILL_OFFSET = { x: 14, y: 26 }

const GEOMETRY_LABEL = {
  point: 'Point',
  vertex: 'Vertex',
  line: 'Line',
  area: 'Area',
  relation: 'Relation',
}

/**
 * One menu row per feature: its preset icon, its name or its type (as the sidebar's head shows
 * them), and its geometry as a quiet word. Choosing a row keeps the menu open, and hovering or
 * focusing it highlights the feature on the map, as a calm halo beside the selection's glow.
 */
export function featureItems(
  ids: readonly string[],
  isCurrent: (id: string) => boolean,
  choose: (id: string) => void,
  section?: string,
): MenuItem[] {
  return ids.map((id) => {
    const entity = engine.entity(id)
    const kind = entity ? (entity.preset?.name ?? GEOMETRY_LABEL[entity.geometry]) : undefined
    return {
      id: `feature:${id}`,
      label: entity?.tags.name ?? kind ?? 'Feature',
      icon: (
        <PresetIcon
          icon={entity?.preset?.icon}
          className="size-5 fill-zinc-700 dark:fill-zinc-200"
        />
      ),
      shortcut: entity ? entity.geometry : undefined,
      current: isCurrent(id),
      keepOpen: true,
      section,
      run: () => choose(id),
      preview: (on: boolean) => engine.setRelated(on ? [id] : null),
    }
  })
}

/**
 * The pill on the map for a plain click that found several features at its place: "1 of 4". A
 * click opens the list of them (a menu at the pill). `,` and `.` step through them; the keys are
 * in useShortcuts. The pill follows the map and goes when the selection leaves the stack.
 */
export function StackPicker() {
  const stack = useStack()
  const { ids: selected, select } = useSelection()
  // the list is open for one stack only: a new stack starts with the list closed
  const [list, setList] = useState<{ stack: Stack; at: { x: number; y: number } } | null>(null)
  // the map moves while the pill is shown: a render on each move places the pill again
  const [, moved] = useState(0)

  useEffect(() => {
    const map = engine.map
    if (!stack || !map) return
    const onMove = () => moved((n) => n + 1)
    map.on('move', onMove)
    return () => {
      map.off('move', onMove)
    }
  }, [stack])

  const shown = stack !== null && keepsStack(stack, selected)
  const rows = useEngine(() =>
    shown && list?.stack === stack && stack
      ? featureItems(
          stack.ids,
          (id) => id === selected[0],
          (id) => select(id),
        )
      : [],
  )
  const map = engine.map
  if (!stack || !shown || !map) return null

  const box = map.getCanvas().getBoundingClientRect()
  const point = map.project([stack.lon, stack.lat])
  const index = stack.ids.indexOf(selected[0] ?? '')
  const open = list?.stack === stack

  return (
    <>
      <Tooltip
        label="Features at this place"
        shortcut=", ."
        description="Click to list them. , takes the previous one and . the next one."
      >
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            left: box.left + point.x + PILL_OFFSET.x,
            top: box.top + point.y - PILL_OFFSET.y,
          }}
          onClick={(event) => {
            const at = event.currentTarget.getBoundingClientRect()
            setList({ stack, at: { x: at.left, y: at.bottom + 4 } })
          }}
          className="fixed z-40 flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 hover:bg-zinc-50 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10 dark:hover:bg-zinc-700"
        >
          <Square2StackIcon className="size-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
          <span>
            {index + 1} of {stack.ids.length}
          </span>
        </button>
      </Tooltip>
      {open && list && (
        <ContextMenu
          at={list.at}
          label="Features here"
          items={rows}
          onClose={() => {
            setList(null)
            engine.setRelated(null)
          }}
        />
      )}
    </>
  )
}
