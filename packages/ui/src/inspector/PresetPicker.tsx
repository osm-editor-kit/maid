import type { Preset } from '@osm-editor-kit/maid-presets'
import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { mainTagLabel, moveActive } from './picker-logic.ts'

const FRAME =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'

export function PresetPicker(props: {
  /** Returns the presets for a query, best first. Called on every change of the query. */
  search: (query: string) => Preset[]
  onPick: (preset: Preset) => void
  /** Draws a preset's icon; without it rows have no icon */
  renderIcon?: (preset: Preset) => ReactNode
  /** The preset the feature has now, marked in the list */
  currentId?: string
  autoFocus?: boolean
  placeholder?: string
}): ReactNode {
  const {
    search,
    onPick,
    renderIcon,
    currentId,
    autoFocus = false,
    placeholder = 'Search feature types',
  } = props

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const results = search(query)
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1)

  /** Scrolls a row into view; the row is already rendered, so the element exists. */
  function reveal(index: number) {
    document.getElementById(optionId(index))?.scrollIntoView({ block: 'nearest' })
  }

  function moveTo(index: number) {
    setActiveIndex(index)
    reveal(index)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        moveTo(moveActive(active, event.key === 'ArrowDown' ? 1 : -1, results.length))
        return
      case 'Home':
        event.preventDefault()
        moveTo(results.length > 0 ? 0 : -1)
        return
      case 'End':
        event.preventDefault()
        moveTo(results.length - 1)
        return
      case 'Enter': {
        const preset = results[active]
        if (preset) {
          event.preventDefault()
          onPick(preset)
        }
        return
      }
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        type="search"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        aria-label={placeholder}
        aria-expanded={results.length > 0}
        aria-controls={results.length > 0 ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.currentTarget.value)
          setActiveIndex(0)
        }}
        onKeyDown={onKeyDown}
        className={`${FRAME} px-2 placeholder:text-zinc-400 dark:placeholder:text-zinc-500`}
      />

      {results.length === 0 ? (
        <p className="px-2 py-3 text-center text-sm text-zinc-500 dark:text-zinc-400">
          No feature type found
        </p>
      ) : (
        <div
          id={listId}
          role="listbox"
          aria-label="Feature types"
          className="max-h-80 overflow-y-auto rounded-md border border-zinc-950/10 p-1 dark:border-white/10"
        >
          {results.map((preset, index) => {
            const isActive = index === active
            const tag = mainTagLabel(preset)
            return (
              <div
                key={preset.id}
                id={optionId(index)}
                role="option"
                aria-selected={isActive}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => onPick(preset)}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                  isActive ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                }`}
              >
                {renderIcon ? (
                  <span className="inline-flex size-5 shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400 [&>svg]:size-5">
                    {renderIcon(preset)}
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{preset.name}</span>
                {tag ? (
                  <span className="max-w-[45%] min-w-0 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {tag}
                  </span>
                ) : null}
                {preset.id === currentId ? (
                  <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                    current
                  </span>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
