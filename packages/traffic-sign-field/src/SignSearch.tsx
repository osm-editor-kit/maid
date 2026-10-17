import type { SignType } from '@osm-traffic-signs/converter'
import { useId, useState, type KeyboardEvent } from 'react'
import type { Country } from './catalogue.ts'
import { isExcludedByCompatibility } from './compatibility.ts'
import { searchCatalogue } from './search-catalogue.ts'
import { entryOf, parseSignValue, signTitle, type SignEntry } from './sign-value.ts'
import { SignImage } from './SignImage.tsx'
import type { TrafficSignTexts } from './texts.ts'
import type { LoadSvg } from './use-sign-image.ts'

/** Same frame as the other text controls of the inspector (packages/ui/src/inspector/fields/shared.ts, INPUT) */
const INPUT_CLASS =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'
/** Options shown at most: a short query matches most of the catalogue, and every option loads an image */
export const MAX_OPTIONS = 50

/**
 * What Enter adds when no option is highlighted (the d3 field's rule): the typed text parsed; if nothing in it is
 * known and the catalogue has a best match, that match; if the only matches clash with the signs already there,
 * nothing; else the text as unknown entries.
 */
export function entriesForTypedText(
  text: string,
  country: Country,
  catalogue: readonly SignType[],
  existing: readonly SignEntry[],
): SignEntry[] {
  const typed = text.trim()
  if (!typed) return []
  const parsed = parseSignValue(typed, country, catalogue)
  if (parsed.length === 0 || parsed.some((entry) => entry.sign)) return parsed
  const existingSigns = existing.flatMap((entry) => (entry.sign ? [entry.sign] : []))
  const [best] = searchCatalogue(catalogue, typed, {
    exclude: (sign) => isExcludedByCompatibility(sign, existingSigns),
  })
  if (best) return [entryOf(best)]
  return searchCatalogue(catalogue, typed).length > 0 ? [] : parsed
}

/**
 * The search under the rows: an ARIA combobox over a listbox. ArrowDown/ArrowUp move, Enter picks the highlighted
 * option (or adds the text), Escape clears. The list is in the flow, not floating: it pushes the rows below it
 * down instead of being cut by the sidebar's scroll area.
 */
export function SignSearch({
  id,
  catalogue,
  existing,
  country,
  load,
  texts,
  onAdd,
}: {
  id?: string
  /** Null: the catalogue failed to load; then only typed text can be added, as unknown */
  catalogue: readonly SignType[] | null
  existing: readonly SignEntry[]
  country: Country
  load: LoadSvg
  texts: TrafficSignTexts
  onAdd: (entries: SignEntry[]) => void
}) {
  const listId = useId()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)

  const existingSigns = existing.flatMap((entry) => (entry.sign ? [entry.sign] : []))
  const results = catalogue
    ? searchCatalogue(catalogue, query, {
        exclude: (sign) => isExcludedByCompatibility(sign, existingSigns),
      })
    : []
  const shown = results.slice(0, MAX_OPTIONS)
  const open = focused && query.trim() !== ''
  const activeOption = active >= 0 && active < shown.length ? shown[active] : undefined

  function optionId(index: number) {
    return `${listId}-${index}`
  }

  function reset() {
    setQuery('')
    setActive(-1)
  }

  function pick(sign: SignType) {
    onAdd([entryOf(sign)])
    reset()
  }

  function move(delta: number) {
    if (shown.length === 0) return
    const next =
      active < 0
        ? delta > 0
          ? 0
          : shown.length - 1
        : (active + delta + shown.length) % shown.length
    setActive(next)
    document.getElementById(optionId(next))?.scrollIntoView?.({ block: 'nearest' })
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      move(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (activeOption) pick(activeOption)
      else {
        const entries = entriesForTypedText(query, country, catalogue ?? [], existing)
        if (entries.length > 0) onAdd(entries)
        if (entries.length > 0 || !query.trim()) reset()
      }
    } else if (event.key === 'Escape' && query !== '') {
      // the combobox owns Escape while it has text: the editor's Escape (deselect) must not see it
      event.preventDefault()
      event.stopPropagation()
      reset()
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-label={texts.searchLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && activeOption ? optionId(active) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        data-1p-ignore
        data-lpignore="true"
        data-bwignore
        data-form-type="other"
        className={INPUT_CLASS}
        placeholder={texts.addPlaceholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(-1)
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
      />
      <ul
        id={listId}
        role="listbox"
        aria-label={texts.searchLabel}
        hidden={!open}
        className="mt-1 max-h-72 overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-0.5 shadow-sm dark:border-white/10 dark:bg-zinc-900"
      >
        {open && catalogue && shown.length === 0 ? (
          <li role="presentation" className="px-2 py-1.5 text-sm text-zinc-500 dark:text-zinc-400">
            {texts.noResults}
          </li>
        ) : null}
        {open
          ? shown.map((sign, index) => (
              <li
                key={sign.osmValuePart}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                // mousedown would blur the input before the click
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => pick(sign)}
                onMouseMove={() => {
                  if (active !== index) setActive(index)
                }}
                className="flex cursor-default items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-zinc-950/5 aria-selected:bg-zinc-950/5 aria-selected:ring-2 aria-selected:ring-blue-500 aria-selected:ring-inset dark:hover:bg-white/10 dark:aria-selected:bg-white/10"
              >
                <SignImage load={load} country={country} part={sign.osmValuePart} size="size-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-950 dark:text-white">
                    {signTitle(sign)}
                  </span>
                  <span className="block truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {sign.osmValuePart}
                  </span>
                </span>
              </li>
            ))
          : null}
        {open && results.length > shown.length ? (
          <li role="presentation" className="px-2 py-1 text-xs text-zinc-500 dark:text-zinc-400">
            {texts.moreResults({ count: results.length - shown.length })}
          </li>
        ) : null}
      </ul>
    </div>
  )
}
