import { useState } from 'react'
import { isFavouriteNumber } from './favourites.ts'
import { PLAIN_INPUT } from './plain-input.ts'

/**
 * The number of a favourite, as a field. It is sent on Enter or when the field loses focus, not on every key: a
 * number that another favourite has swaps the two, so a half-typed number must not swap. A number that is empty,
 * zero or starts with zero is invalid: it is shown so, and not sent. Escape gives back the number the favourite has.
 */
export function FavouriteNumberField(props: {
  /** The favourite's preset name, for the field's name for screen readers */
  name: string
  value: string
  onCommit: (next: string) => void
  /** The tooltip: how to start the favourite with the number */
  title?: string
}) {
  const { name, value, onCommit, title } = props
  const [draft, setDraft] = useState(value)
  // a number that changed elsewhere (a swap with another favourite) replaces the draft
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDraft(value)
  }
  const valid = isFavouriteNumber(draft)
  const commit = () => {
    if (valid && draft !== value) onCommit(draft)
  }
  return (
    <input
      {...PLAIN_INPUT}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      aria-label={`Number of ${name}`}
      aria-invalid={!valid}
      title={title}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onBlur={() => {
        // an invalid number is given up: the favourite keeps the number it had
        if (valid) commit()
        else setDraft(value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          commit()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          setDraft(value)
        }
      }}
      className="h-8 w-14 shrink-0 rounded-md border border-zinc-950/10 bg-white px-2 text-center font-mono text-xs text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 aria-invalid:border-rose-500 aria-invalid:text-rose-600 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:aria-invalid:border-rose-400 dark:aria-invalid:text-rose-400"
    />
  )
}
