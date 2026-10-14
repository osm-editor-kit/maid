import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useDebouncedValue } from '../use-debounced-value.ts'
import { stepHighlight, suggestAction, type SuggestAction } from './suggest.ts'
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
 * The suggestions of one editing cell, as a TanStack query: keyed by the cell and the text, the text debounced
 * (the input is debounced, not the query). A new text is a new query, and TanStack aborts the request of the
 * old one; an answer for an old text is never shown. The previous answer stays while the new one is on its way,
 * but only in the same cell. Never retried: a source may be a taginfo request, and a failure is no answer.
 * The list closes for a text by Escape or a pick, and opens again when the text changes.
 */
export function useSuggestions(input: SuggestionsInput): Suggestions {
  const { enabled, suggest, delay, cellRow, cellCol, row, text } = input
  const owner = `${cellRow}\u0000${cellCol}`
  // The text asked: undefined while the cell is quiet, so that a cell that starts editing waits `delay` too.
  const asked = useDebouncedValue(enabled ? text : undefined, delay)
  // Both are kept with the cell's owner, so that a close or a highlight in one cell does not reach another.
  const [dismissed, setDismissedState] = useState<{ owner: string; text: string }>()
  const [picked, setPicked] = useState<{ owner: string; text: string; index: number }>()
  const setDismissed = (next: string) => setDismissedState({ owner, text: next })

  const answer = useQuery({
    queryKey: ['sheet-suggest', owner, asked] as const,
    queryFn: async ({ signal }) => {
      if (suggest === undefined || asked === undefined) return []
      try {
        return await suggest({ cell: { row: cellRow, col: cellCol }, row, text: asked }, signal)
      } catch {
        return []
      }
    },
    enabled: enabled && suggest !== undefined && asked !== undefined,
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === owner ? keepPreviousData(previous) : undefined,
    retry: false,
    // a suggestion is for the text typed now: no copy of it is kept once the cell moves on
    gcTime: 0,
  })

  const items = enabled && answer.data !== undefined ? answer.data : []
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
