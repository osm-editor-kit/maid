import { EyeIcon, EyeSlashIcon, PencilIcon } from '@heroicons/react/16/solid'
import type { Filter, FilterState } from '@osm-editor-kit/maid-filters'
import type { KeyboardEvent, ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'

type Option = { state: FilterState; label: string; Icon: typeof PencilIcon }

const OPTIONS: readonly Option[] = [
  { state: 'editable', label: 'Editable', Icon: PencilIcon },
  { state: 'readonly', label: 'Read-only', Icon: EyeIcon },
  { state: 'hidden', label: 'Hidden', Icon: EyeSlashIcon },
]

const STATES: readonly FilterState[] = OPTIONS.map((option) => option.state)

/** Lists the filters with a three-way switch each: what can be done with their objects on the map. */
export function FilterPanel(props: {
  filters: readonly Filter[]
  /** Current state per filter id */
  states: Record<string, FilterState>
  onChange: (id: string, state: FilterState) => void
  /** How many objects on the map each filter decides for; shown when given */
  counts?: Record<string, number>
}): ReactNode {
  const { filters, states, onChange, counts } = props
  const current = (filter: Filter): FilterState => states[filter.id] ?? filter.state
  const differing = filters.filter((filter) => current(filter) !== filter.state)

  return (
    <div>
      <div className="flex h-9 items-center justify-between gap-3 px-4 text-xs text-zinc-500 dark:text-zinc-400">
        <span>The first filter that matches a feature decides.</span>
        {differing.length > 0 ? (
          <button
            type="button"
            className="shrink-0 cursor-pointer rounded-sm font-medium text-zinc-950 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-white"
            onClick={() => {
              for (const filter of differing) onChange(filter.id, filter.state)
            }}
          >
            Reset
          </button>
        ) : null}
      </div>
      <ul className="columns-[18rem] gap-x-8 px-4 pb-4">
        {filters.map((filter) => {
          const state = current(filter)
          const count = counts?.[filter.id]
          const changed = state !== filter.state
          return (
            <li key={filter.id} className="flex break-inside-avoid items-center gap-2 py-1.5">
              <span
                className={twJoin(
                  'min-w-0 flex-1 truncate text-sm',
                  state === 'hidden'
                    ? 'text-zinc-500 dark:text-zinc-400'
                    : 'text-zinc-950 dark:text-white',
                )}
              >
                {filter.label}
              </span>
              {count !== undefined ? (
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {count.toLocaleString('en')}
                </span>
              ) : null}
              {changed ? (
                <span
                  role="img"
                  aria-label="Changed from the default"
                  title="Changed from the default"
                  className="size-1.5 shrink-0 rounded-full bg-blue-500"
                />
              ) : null}
              <StateSwitch
                label={filter.label}
                value={state}
                onSelect={(next) => onChange(filter.id, next)}
              />
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A radio group of the three states; the arrow keys move between them and select. */
function StateSwitch(props: {
  label: string
  value: FilterState
  onSelect: (state: FilterState) => void
}): ReactNode {
  const { label, value, onSelect } = props

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const index = (STATES.indexOf(value) + step + STATES.length) % STATES.length
    const next = STATES[index]
    if (next === undefined) return
    onSelect(next)
    const target = event.currentTarget.parentElement?.children[index]
    if (target instanceof HTMLElement) target.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={`${label}: what can be done`}
      className="isolate inline-flex shrink-0 rounded-md shadow-xs dark:shadow-none [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md"
    >
      {OPTIONS.map((option) => {
        const checked = option.state === value
        return (
          <button
            key={option.state}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            tabIndex={checked ? 0 : -1}
            onClick={() => onSelect(option.state)}
            onKeyDown={onKeyDown}
            className={twJoin(
              'relative inline-flex size-7 shrink-0 cursor-pointer items-center justify-center inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:inset-ring-white/10',
              checked
                ? 'bg-zinc-200 text-zinc-950 enabled:hover:bg-zinc-300 dark:bg-zinc-600 dark:text-white dark:enabled:hover:bg-zinc-500'
                : 'bg-white text-zinc-950 enabled:hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:enabled:hover:bg-zinc-700',
            )}
          >
            <option.Icon aria-hidden="true" className="size-4" />
          </button>
        )
      })}
    </div>
  )
}
