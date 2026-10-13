import { useEffect, useMemo, useState } from 'react'
import { createSuggestRuns, stepHighlight, suggestAction, type SuggestAction } from './suggest.ts'
import type { ColId, RowId, SheetRow, SheetSuggestion, Suggest } from './types.ts'

export type SuggestionsInput = {
  /** Only the cell being edited asks; a quiet cell has no list and no request. */
  enabled: boolean
  suggest: Suggest | undefined
  /** Milliseconds before the request: 0 for a local list, 300 for a request (sheet-design.md). */
  delay: number
  cellRow: RowId
  cellCol: ColId
  row: SheetRow
  /** The draft while editing: each change asks again. */
  text: string
}

/** A key the list took: the action, and for `take` the value to write into the input. */
export type SuggestionKey = { action: SuggestAction; value?: string }

export type Suggestions = {
  /** The items for this cell. While a new answer is on its way the previous one stays (quiet, no flicker). */
  items: readonly SheetSuggestion[]
  highlighted: number
  open: boolean
  /** Edit-mode key: undefined when the key is the cell's own. */
  keyDown(key: string): SuggestionKey | undefined
  /** The list is closed for this text (after a pick, or Escape). Typing opens it again. */
  dismiss(text: string): void
}

/**
 * The suggestions of one editing cell. The answer of a source is kept per cell; a run aborts the previous
 * one when the text changes, and an answer of an old run is ignored (createSuggestRuns, suggest.ts).
 * The list closes for a text by Escape or a pick, and opens again when the text changes.
 */
export function useSuggestions(input: SuggestionsInput): Suggestions {
  const { enabled, suggest, delay, cellRow, cellCol, row, text } = input
  const owner = `${cellRow}\u0000${cellCol}`
  const runs = useMemo(() => createSuggestRuns(), [])
  const [answer, setAnswer] = useState<{ owner: string; items: readonly SheetSuggestion[] }>({
    owner: '',
    items: [],
  })
  // Both are kept with the cell's owner, so that a close or a highlight in one cell does not reach another.
  const [dismissed, setDismissedState] = useState<{ owner: string; text: string }>()
  const [picked, setPicked] = useState<{ owner: string; text: string; index: number }>()
  const setDismissed = (next: string) => setDismissedState({ owner, text: next })

  useEffect(() => {
    if (!enabled || suggest === undefined) return undefined
    const run = runs.start()
    const ask = () => {
      let result: ReturnType<Suggest>
      try {
        result = suggest({ cell: { row: cellRow, col: cellCol }, row, text }, run.signal)
      } catch {
        result = []
      }
      void Promise.resolve(result).then(
        (items) => {
          if (run.isCurrent()) setAnswer({ owner, items })
        },
        () => {
          if (run.isCurrent()) setAnswer({ owner, items: [] })
        },
      )
    }
    if (delay <= 0) ask()
    const timer = delay > 0 ? setTimeout(ask, delay) : undefined
    return () => {
      clearTimeout(timer)
      runs.cancel()
    }
  }, [enabled, suggest, delay, cellRow, cellCol, row, text, owner, runs])

  const items = enabled && answer.owner === owner ? answer.items : []
  const highlighted =
    picked !== undefined &&
    picked.owner === owner &&
    picked.text === text &&
    picked.index < items.length
      ? picked.index
      : -1
  const open =
    enabled &&
    items.length > 0 &&
    !(dismissed !== undefined && dismissed.owner === owner && dismissed.text === text)

  return {
    items,
    highlighted,
    open,
    keyDown(key) {
      const action = suggestAction(key, { open, count: items.length, highlighted })
      if (action === undefined) return undefined
      if (action === 'next' || action === 'previous') {
        const delta = action === 'next' ? 1 : -1
        setPicked({ owner, text, index: stepHighlight(highlighted, delta, items.length) })
        return { action }
      }
      if (action === 'take') {
        const value = items[highlighted]?.value
        if (value === undefined) return undefined
        setDismissed(value)
        return { action, value }
      }
      setDismissed(text)
      return { action }
    },
    dismiss(next) {
      setDismissed(next)
    },
  }
}
