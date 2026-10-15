import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/20/solid'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { useState } from 'react'
import { useImageryContext, useView } from './imagery-store.ts'
import { useCannotShift } from './offset-protocol.ts'
import {
  formatOffset,
  isZeroOffset,
  NO_OFFSET,
  nudgeOffset,
  NUDGES,
  readOffset,
  type Direction,
  type Meters,
} from './offset.ts'

const MUTED = 'text-xs text-zinc-500 dark:text-zinc-400'
const ERROR = 'text-xs text-red-700 dark:text-red-400'
const FIELD =
  'h-8 w-full rounded-md bg-white px-2.5 text-sm inset-ring-1 inset-ring-zinc-950/10 placeholder:text-zinc-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:bg-zinc-800 dark:inset-ring-white/10'
const ICON_BUTTON =
  'flex size-8 items-center justify-center rounded-md text-zinc-500 inset-ring-1 inset-ring-zinc-950/10 enabled:hover:bg-zinc-200 enabled:hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 dark:inset-ring-white/10 dark:text-zinc-400 dark:enabled:hover:bg-zinc-600 dark:enabled:hover:text-white'

/** The four nudge buttons, in the cells of a 3 by 3 grid (the corners are empty, as in iD's section) */
const NUDGE_BUTTONS: readonly {
  direction: Direction
  label: string
  Icon: typeof ArrowUpIcon
  cell: string
}[] = [
  { direction: 'up', label: 'Move imagery up', Icon: ArrowUpIcon, cell: 'col-start-2 row-start-1' },
  {
    direction: 'left',
    label: 'Move imagery left',
    Icon: ArrowLeftIcon,
    cell: 'col-start-1 row-start-2',
  },
  {
    direction: 'right',
    label: 'Move imagery right',
    Icon: ArrowRightIcon,
    cell: 'col-start-3 row-start-2',
  },
  {
    direction: 'down',
    label: 'Move imagery down',
    Icon: ArrowDownIcon,
    cell: 'col-start-2 row-start-3',
  },
]

/**
 * The imagery offset of the background, in the panel's "Imagery offset" disclosure (closed by default, as in iD). Four
 * nudges in small steps, a field for the offset in meters (east, north), and a reset. The value is the URL's `offset`
 * (core's `useUrlParam`): live state, not remembered. The map layer draws it (ImageryLayers.tsx).
 */
export function OffsetSection(props: { background: string }) {
  const { urls } = useImageryContext()
  const [stored, setOffset] = useUrlParam(urls.offset)
  const view = useView()
  const cannotShift = useCannotShift(props.background)
  const offset: Meters = stored ?? NO_OFFSET
  const zero = isZeroOffset(offset)
  // what the person is typing, until it is taken (Enter or leaving the field); null shows the offset
  const [draft, setDraft] = useState<string | null>(null)
  const [invalid, setInvalid] = useState(false)

  const apply = (next: Meters | null) => {
    setDraft(null)
    setInvalid(false)
    void setOffset(next)
  }

  // iD's nudge: the step is in screen pixels, at the zoom of the view (a pixel is 1 / 2^zoom of the zoom-0 world)
  const nudge = (direction: Direction) => {
    if (view === null) return
    apply(nudgeOffset(offset, NUDGES[direction], view.zoom))
  }

  // iD: an empty field resets, two numbers set, anything else is shown as an error and kept
  const commit = () => {
    if (draft === null) return
    const text = draft.trim()
    if (text === '') {
      apply(null)
      return
    }
    const next = readOffset(text)
    if (next === null) {
      setInvalid(true)
      return
    }
    apply(isZeroOffset(next) ? null : next)
  }

  return (
    <details className="border-t border-zinc-950/5 px-4 py-3 dark:border-white/5">
      <summary className="cursor-pointer text-sm font-medium">
        Imagery offset{zero ? '' : `: ${formatOffset(offset)} m`}
      </summary>
      <div className="flex flex-col gap-3 pt-3">
        <p className={MUTED}>
          Use this when the imagery and the OSM data do not line up. Move the imagery in small
          steps, or enter the offset in meters, east and north of its place.
        </p>
        <div className="flex items-center gap-3">
          <div className="grid size-20 shrink-0 grid-cols-3 grid-rows-3 gap-0.5">
            {NUDGE_BUTTONS.map(({ direction, label, Icon, cell }) => (
              <button
                key={direction}
                type="button"
                title={label}
                aria-label={label}
                disabled={view === null}
                onClick={() => nudge(direction)}
                className={`${cell} ${ICON_BUTTON} size-full`}
              >
                <Icon aria-hidden={true} className="size-4" />
              </button>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <input
              {...PLAIN_INPUT}
              type="text"
              inputMode="decimal"
              aria-label="Imagery offset in meters, east and north"
              aria-invalid={invalid}
              value={draft ?? formatOffset(offset)}
              onChange={(event) => {
                setDraft(event.target.value)
                setInvalid(false)
              }}
              onBlur={commit}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commit()
              }}
              className={FIELD}
            />
            <span className={MUTED}>meters: east, north</span>
          </div>
          <button
            type="button"
            title="Reset the imagery offset"
            aria-label="Reset the imagery offset"
            disabled={zero}
            onClick={() => apply(null)}
            className={ICON_BUTTON}
          >
            <ArrowUturnLeftIcon aria-hidden={true} className="size-4" />
          </button>
        </div>
        {invalid ? (
          <p className={ERROR}>
            Enter two numbers in meters, east and north, separated by a comma. An empty field resets
            the offset.
          </p>
        ) : null}
        {cannotShift ? <p className={ERROR}>This imagery cannot be shifted</p> : null}
      </div>
    </details>
  )
}
