import { Square2StackIcon } from '@heroicons/react/16/solid'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { ContextMenu, Tooltip } from '@osm-editor-kit/maid-ui'
import { useEffect, useState } from 'react'
import { useSelection } from '../selection'
import { useEngine, useShell } from '../shell-context'
import { keepsStack, useStack, type Stack } from '../stack'
import { PresetIcon } from './PresetIcon'

/** The pill sits up and to the right of the place it is for, so that it does not cover the feature */
const PILL_OFFSET = { x: 14, y: 26 }

/** The count of a stack as a chip: the same chip for the pill and for the marker in the menu */
export const STACK_CHIP_CLASS =
  'flex h-6 items-center gap-1 rounded-full bg-white px-2 text-xs font-medium text-zinc-800 shadow ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:text-zinc-100 dark:ring-white/10'

const GEOMETRY_LABEL = {
  point: 'Point',
  vertex: 'Vertex',
  line: 'Line',
  area: 'Area',
  relation: 'Relation',
}

const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth']

/** The accessible name of the pill: "3 features here, the first is selected" */
function stackName(total: number, index: number) {
  const which = ORDINALS[index] ? `the ${ORDINALS[index]}` : `number ${index + 1}`
  return `${total} features here, ${which} is selected`
}

/**
 * One menu row per feature: its preset icon, its name or its type (as the sidebar's head shows
 * them), and its geometry as a quiet word. Choosing a row keeps the menu open, and hovering or
 * focusing it highlights the feature on the map, as a calm halo beside the selection's glow.
 */
export function featureItems(
  engine: MaidEngine,
  ids: readonly string[],
  isCurrent: (id: string) => boolean,
  choose: (id: string) => void,
  section?: string,
) {
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

/** The icon and the count, "2 of 3". `index` is -1 when the selection is not one of the features */
export function StackCount({ index, total }: { index: number; total: number }) {
  return (
    <>
      <Square2StackIcon className="size-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
      <span>{index >= 0 ? `${index + 1} of ${total}` : `${total} features`}</span>
    </>
  )
}

/**
 * The pill on the map for a plain click that found several features at its place: "1 of 4". A
 * click opens the list of them (a menu at the pill). `,` and `.` step through them; the keys are
 * in useShortcuts. The pill shows while the selection is one of the stack, in browse mode and
 * with no menu open (the menu has the count itself). The map moving, a drag, a mode change or
 * Escape ends the stack (MapView, stack.ts), and so the pill.
 */
export function StackPicker() {
  const { engine } = useShell()
  const stack = useStack()
  const { ids: selected, select } = useSelection()
  const mode = useEngine((e) => e.mode)
  const measuring = useEngine((e) => e.measuring)
  // the list is open for one stack only: a new stack starts with the list closed
  const [list, setList] = useState<{ stack: Stack; at: { x: number; y: number } } | null>(null)
  // the sidebar or the window changes the map's place on the page: the pill is placed again
  const [, redraw] = useState(0)

  useEffect(() => {
    const map = engine.map
    if (!stack || !map) return
    const onResize = () => redraw((n) => n + 1)
    map.on('resize', onResize)
    return () => {
      map.off('resize', onResize)
    }
  }, [stack, engine.map])

  const shown = stack !== null && keepsStack(stack, selected) && mode === 'browse' && !measuring
  const rows = useEngine(() =>
    shown && list?.stack === stack && stack
      ? featureItems(
          engine,
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
          data-stack-pill
          aria-label={stackName(stack.ids.length, index)}
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            left: box.left + point.x + PILL_OFFSET.x,
            // kept below the top of the window, where it would be cut off
            top: Math.max(box.top + 4, box.top + point.y - PILL_OFFSET.y),
          }}
          onClick={(event) => {
            const at = event.currentTarget.getBoundingClientRect()
            setList({ stack, at: { x: at.left, y: at.bottom + 4 } })
          }}
          className={`${STACK_CHIP_CLASS} fixed z-40 hover:bg-zinc-50 dark:hover:bg-zinc-700`}
        >
          <StackCount index={index} total={stack.ids.length} />
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
