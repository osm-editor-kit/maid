import { EyeSlashIcon, PencilIcon } from '@heroicons/react/16/solid'
import type { Filter, FilterState } from '@osm-editor-kit/maid-filters'
import { twJoin } from 'tailwind-merge'
import { PencilSlashIcon } from './PencilSlashIcon.tsx'
import { SegmentedControl } from './Toolbar.tsx'

type Option = {
  state: FilterState
  label: string
  Icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactNode
}

const OPTIONS: readonly Option[] = [
  { state: 'editable', label: 'Editable', Icon: PencilIcon },
  { state: 'readonly', label: 'Read-only', Icon: PencilSlashIcon },
  { state: 'hidden', label: 'Hidden', Icon: EyeSlashIcon },
]

/** The three states as the icon buttons of each filter's switch */
const STATE_OPTIONS = OPTIONS.map((option) => ({
  value: option.state,
  label: option.label,
  icon: <option.Icon aria-hidden="true" className="size-4" />,
}))

/** Lists the filters with a three-way switch each: what can be done with their objects on the map. */
export function FilterPanel(props: {
  filters: readonly Filter[]
  /** Current state per filter id */
  states: Record<string, FilterState>
  onChange: (id: string, state: FilterState) => void
  /** How many objects on the map each filter decides for; shown when given */
  counts?: Record<string, number>
}) {
  const { filters, states, onChange, counts } = props
  const current = (filter: Filter) => states[filter.id] ?? filter.state
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
            // the switch first, so the switches of a column line up and each row reads as one group
            <li key={filter.id} className="flex break-inside-avoid items-center gap-3 py-1.5">
              <SegmentedControl
                label={`${filter.label}: what can be done`}
                options={STATE_OPTIONS}
                value={state}
                onSelect={(next) => onChange(filter.id, next)}
                className="shrink-0"
              />
              <span
                className={twJoin(
                  'min-w-0 truncate text-sm',
                  state === 'hidden'
                    ? 'text-zinc-500 dark:text-zinc-400'
                    : 'text-zinc-950 dark:text-white',
                )}
              >
                {filter.label}
              </span>
              {changed ? (
                <span
                  role="img"
                  aria-label="Changed from the default"
                  title="Changed from the default"
                  className="-ml-1.5 size-1.5 shrink-0 rounded-full bg-blue-500"
                />
              ) : null}
              {count !== undefined ? (
                <span className="ml-auto shrink-0 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
                  {count.toLocaleString('en')}
                </span>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
