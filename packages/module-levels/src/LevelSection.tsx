import { ArrowRightIcon, ArrowsRightLeftIcon } from '@heroicons/react/16/solid'
import { levelsOf } from '@osm-editor-kit/maid-levels'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import { Tooltip } from '@osm-editor-kit/maid-ui'
import { type MouseEvent, useState } from 'react'
import { useLevelEngine } from './engine-store.ts'
import {
  inclineTag,
  levelNumber,
  nextIncline,
  pairOf,
  pairOfSuggestion,
  pairSuggestion,
  pairValue,
} from './level-section.ts'
import { isConnector, type LevelSuggestion } from './level-suggestions.ts'
import { levelOffersFor, nearbySuggestionsFor, SetLevelMenu } from './LevelMenu.tsx'
import { buttonClass } from './look.ts'

/** The menu's width (w-20, 80 px): it opens left of the button */
const MENU_OFFSET = 88

/** The open "Set level" menu: which button it is for (the whole level, or one end of a connector) and its offers */
type Open = {
  end: 'single' | 'from' | 'to'
  at: { x: number; y: number }
  suggestions: LevelSuggestion[]
}

/**
 * The level of the selected feature at the top of the inspector: one button for a feature, and for a connector
 * (steps, a ramp, an escalator) the level it starts from and the level it ends at. Edits go through the engine, one
 * undo step each.
 */
export function LevelSection({ entity }: InspectorSectionProps) {
  const engine = useLevelEngine()
  const [opened, setOpen] = useState<(Open & { id: string }) | null>(null)
  // a menu belongs to the feature it was opened for: another selection closes it
  const open = opened?.id === entity.id ? opened : null
  if (!engine) return null

  const tags = entity.tags
  const readOnly = entity.readOnly
  const level = tags.level
  const pair = pairOf(tags)
  const firstLevel = levelsOf(tags).levels[0]

  /** Opens the menu left of the clicked button, with the offers for the feature (a pair suggestion is not a value) */
  function openMenu(event: MouseEvent<HTMLButtonElement>, end: Open['end']) {
    if (!engine) return
    const offers = levelOffersFor(engine, entity.id)
    if (!offers) return
    const rect = event.currentTarget.getBoundingClientRect()
    const suggestions =
      end === 'single'
        ? offers
        : offers.filter((suggestion) => levelNumber(suggestion.value) !== null)
    setOpen({ id: entity.id, end, at: { x: rect.left - MENU_OFFSET, y: rect.top }, suggestions })
  }

  function choose(suggestion: LevelSuggestion) {
    if (!engine || !open) return
    if (open.end === 'single') {
      engine.assignLevel(entity.id, suggestion.value, suggestion.incline)
    } else {
      const chosen = levelNumber(suggestion.value)
      const other = open.end === 'from' ? pair.to : pair.from
      if (chosen !== null) {
        if (other === null) {
          engine.assignLevel(entity.id, String(chosen))
        } else if (chosen !== other) {
          const from = open.end === 'from' ? chosen : other
          const to = open.end === 'from' ? other : chosen
          const { value, incline } = pairValue(from, to)
          engine.assignLevel(entity.id, value, incline)
        }
      }
    }
    setOpen(null)
  }

  if (!isConnector(tags)) {
    const hasLevel = level !== undefined
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={buttonClass(false)}
          disabled={readOnly}
          aria-label={hasLevel ? `Level ${level}, change it` : 'No level, set one'}
          onPointerEnter={() => engine.hoverLevel(readOnly ? null : (firstLevel ?? 'none'))}
          onPointerLeave={() => engine.hoverLevel(null)}
          onClick={(event) => openMenu(event, 'single')}
        >
          {hasLevel ? level : <span className="text-zinc-500 dark:text-zinc-400">none</span>}
        </button>
        {open?.end === 'single' && (
          <SetLevelMenu
            engine={engine}
            at={open.at}
            suggestions={open.suggestions}
            onChoose={choose}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
    )
  }

  // a connector: the ends in its way's direction, the offers of the feature (for the "Use" button)
  // the surroundings only: the levels in view would query the whole map on every render
  const offers = nearbySuggestionsFor(engine, entity.id) ?? []
  const suggested = pairSuggestion(offers)
  const suggestedPair = suggested ? pairOfSuggestion(suggested) : undefined
  const showUse =
    suggested !== undefined &&
    suggestedPair !== undefined &&
    (suggestedPair.from !== pair.from || suggestedPair.to !== pair.to || !pair.known)
  const incline = inclineTag(tags)

  function endButton(end: 'from' | 'to', value: number | null) {
    return (
      <button
        type="button"
        className={buttonClass(false)}
        disabled={readOnly}
        aria-label={`${end === 'from' ? 'From' : 'To'} level${value === null ? ', none' : ` ${value}`}`}
        onPointerEnter={() => engine?.hoverLevel(readOnly || value === null ? null : value)}
        onPointerLeave={() => engine?.hoverLevel(null)}
        onClick={(event) => openMenu(event, end)}
      >
        {value ?? <span className="text-zinc-400 dark:text-zinc-500">-</span>}
      </button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      {showUse && suggestedPair && suggested && (
        <button
          type="button"
          disabled={readOnly}
          className="rounded-md bg-blue-600/15 px-2 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-600/20 disabled:opacity-50 dark:text-blue-300 dark:hover:bg-blue-400/25"
          onClick={() => {
            engine.assignLevel(entity.id, suggested.value, suggested.incline)
            setOpen(null)
          }}
        >
          Use {suggestedPair.from} → {suggestedPair.to}
        </button>
      )}
      <div className="flex items-center gap-1">
        {endButton('from', pair.from)}
        <ArrowRightIcon className="size-4 text-zinc-500 dark:text-zinc-400" aria-hidden />
        {endButton('to', pair.to)}
        {level !== undefined && pair.to !== null && !readOnly && (
          <Tooltip label="Swap the direction">
            <button
              type="button"
              className={buttonClass(false)}
              aria-label="Swap the direction"
              onClick={() => engine.assignLevel(entity.id, level, nextIncline(incline))}
            >
              <ArrowsRightLeftIcon className="size-4" aria-hidden />
            </button>
          </Tooltip>
        )}
        {!pair.known && (
          <span className="pl-1 text-xs text-zinc-500 dark:text-zinc-400">direction unknown</span>
        )}
      </div>
      {open && open.end !== 'single' && (
        <SetLevelMenu
          engine={engine}
          at={open.at}
          suggestions={open.suggestions}
          onChoose={choose}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
