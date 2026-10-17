import type { SignType } from '@osm-traffic-signs/converter'
import { useEffect, useRef, useState } from 'react'
import { isCountry, loadCatalogue, loadedCatalogue, type Country } from './catalogue.ts'
import { formatSignValue, parseSignValue, resolveCountry, type SignEntry } from './sign-value.ts'
import { SignRow } from './SignRow.tsx'
import { SignSearch } from './SignSearch.tsx'
import { DEFAULT_TEXTS, type TrafficSignTexts } from './texts.ts'
import { DEFAULT_LOAD_SVG, type LoadSvg } from './use-sign-image.ts'

export type TrafficSignFieldProps = {
  /** The id of the search input, for the row's label */
  id?: string
  /** The raw tag value; undefined when the key is absent */
  value: string | undefined
  /** The country of the signs (`DE`); a country without data falls back to DE. A known country prefix in the value wins. */
  country: Country
  /** No change possible: rows only, no search and no buttons */
  readOnly?: boolean
  /** Several features with different values: shown as text, not edited */
  mixed?: boolean
  /** Called once per change with the new value; undefined removes the key */
  onChange?: (value: string | undefined) => void
  texts?: TrafficSignTexts
  /** The URL of a sign's SVG. Default: the converter's bundled SVGs, loaded lazily per sign. */
  loadSvg?: LoadSvg
}

type CatalogueState = { country: Country; catalogue: readonly SignType[] | null }

/**
 * The field for one `traffic_sign` key: a row per sign (picture, name, code, move, remove), and a search that adds
 * a sign or a modifier. Every change calls `onChange` once with the whole value. A part the catalogue does not
 * know stays a row and is written back as it was.
 */
export function TrafficSignField({
  id,
  value,
  country: defaultCountry,
  readOnly = false,
  mixed = false,
  onChange,
  texts = DEFAULT_TEXTS,
  loadSvg = DEFAULT_LOAD_SVG,
}: TrafficSignFieldProps) {
  const country = resolveCountry(value, isCountry(defaultCountry) ? defaultCountry : 'DE')
  const [state, setState] = useState<CatalogueState | undefined>(() => {
    const catalogue = loadedCatalogue(country)
    return catalogue ? { country, catalogue } : undefined
  })
  const [announcement, setAnnouncement] = useState('')
  const listRef = useRef<HTMLOListElement>(null)
  const pendingFocus = useRef<{ index: number; direction: -1 | 1 } | undefined>(undefined)

  useEffect(
    function loadCountryCatalogue() {
      let cancelled = false
      loadCatalogue(country).then(
        (catalogue) => {
          if (!cancelled) setState({ country, catalogue })
        },
        () => {
          if (!cancelled) setState({ country, catalogue: null })
        },
      )
      return () => {
        cancelled = true
      }
    },
    [country],
  )

  // After a move the host re-renders with the new value: put the focus back on the button that was used
  useEffect(function restoreFocusAfterMove() {
    const pending = pendingFocus.current
    if (!pending) return
    pendingFocus.current = undefined
    const which = pending.direction === -1 ? 'up' : 'down'
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-sign-row="${pending.index}"] [data-move="${which}"]:not(:disabled)`,
    )
    ;(
      target ??
      listRef.current?.querySelector<HTMLElement>(`[data-sign-row="${pending.index}"] button`)
    )?.focus()
  })

  const catalogue = state && state.country === country ? state.catalogue : undefined
  const loading = catalogue === undefined
  const entries = parseSignValue(value, country, catalogue ?? [])
  const editable = !readOnly && !mixed && !loading && onChange !== undefined

  function commit(next: SignEntry[]) {
    const written = formatSignValue(next, country)
    if (written !== value) onChange?.(written)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= entries.length) return
    const next = [...entries]
    const [moved] = next.splice(index, 1)
    if (!moved) return
    next.splice(target, 0, moved)
    pendingFocus.current = { index: target, direction }
    setAnnouncement(texts.moved({ position: target + 1, total: entries.length }))
    commit(next)
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {mixed ? (
        <p className="text-sm text-zinc-500 italic dark:text-zinc-400">{texts.mixed}</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {loading ? texts.loading : texts.empty}
        </p>
      ) : (
        <ol ref={listRef} className="flex min-w-0 flex-col gap-1">
          {entries.map((entry, index) => (
            <SignRow
              key={index}
              entry={entry}
              index={index}
              total={entries.length}
              country={country}
              load={loadSvg}
              texts={texts}
              onRemove={
                editable ? () => commit(entries.filter((_, at) => at !== index)) : undefined
              }
              onMove={editable ? (direction) => move(index, direction) : undefined}
              onPart={
                editable
                  ? (part) => commit(entries.map((e, at) => (at === index ? { ...e, part } : e)))
                  : undefined
              }
            />
          ))}
        </ol>
      )}
      {editable ? (
        <SignSearch
          id={id}
          catalogue={catalogue}
          existing={entries}
          country={country}
          load={loadSvg}
          texts={texts}
          onAdd={(added) => commit([...entries, ...added])}
        />
      ) : null}
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  )
}
