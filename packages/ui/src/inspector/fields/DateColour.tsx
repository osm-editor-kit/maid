import { ArrowPathIcon, CalendarIcon, PencilIcon } from '@heroicons/react/16/solid'
import { useRef, useState } from 'react'
import { FallbackField } from './Fallback.tsx'
import { ADDON, AddonInput } from './Link.tsx'
import type { FieldProps } from './shared.ts'
import { colourToHex, isValidDate, pickerDate, showsSetToday, todayIso } from './text-logic.ts'

/**
 * A date as text (YYYY, YYYY-MM or YYYY-MM-DD) with a calendar button and, for check_date and
 * survey:date, a button that sets today. Text that is not a date is still written; a hint shows.
 */
export function DateField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  const pickerRef = useRef<HTMLInputElement>(null)
  // Taken once per mount: the field remounts whenever its tag changes.
  const [today] = useState(() => todayIso(new Date()))
  if (key === undefined) return <FallbackField {...props} />
  // Safari has no showPicker for date inputs (iD hides the button there too)
  const canPick =
    typeof HTMLInputElement !== 'undefined' && 'showPicker' in HTMLInputElement.prototype
  return (
    <AddonInput
      id={id}
      type="text"
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder ?? 'YYYY-MM-DD'}
      onChange={onChange}
      hint={(draft) => {
        const text = draft.trim()
        if (text === '' || isValidDate(text)) return null
        return (
          <span className="min-w-0 truncate text-xs text-amber-600 dark:text-amber-400">
            Not a YYYY, YYYY-MM or YYYY-MM-DD date. Saved as typed.
          </span>
        )
      }}
      addons={({ draft, editable, write }) => {
        if (!editable) return null
        return (
          <>
            {showsSetToday(key, draft, today) ? (
              <button
                type="button"
                aria-label="Set to today"
                title="Set to today"
                className={ADDON}
                onClick={() => write(today)}
              >
                <ArrowPathIcon aria-hidden="true" className="size-4" />
              </button>
            ) : null}
            {canPick ? (
              <>
                <button
                  type="button"
                  aria-label={`Pick a date for ${field.label}`}
                  title="Pick a date"
                  className={ADDON}
                  onClick={() => pickerRef.current?.showPicker()}
                >
                  <CalendarIcon aria-hidden="true" className="size-4" />
                </button>
                <input
                  ref={pickerRef}
                  type="date"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="sr-only"
                  value={pickerDate(draft)}
                  onChange={(event) => write(event.currentTarget.value)}
                />
              </>
            ) : null}
          </>
        )
      }}
    />
  )
}

/**
 * A colour as text (hex or a basic name) with a swatch at its right. In edit mode the swatch
 * opens the native colour picker and a pick writes the hex value; with no colour it shows a pen.
 * An invalid text has no swatch.
 */
export function ColourField(props: FieldProps) {
  const { field, tags, id, onChange } = props
  const key = field.key
  const pickerRef = useRef<HTMLInputElement>(null)
  if (key === undefined) return <FallbackField {...props} />
  return (
    <AddonInput
      id={id}
      type="text"
      tagKey={key}
      value={tags[key] ?? ''}
      placeholder={field.placeholder ?? 'Unknown'}
      onChange={onChange}
      addons={({ draft, editable, write }) => {
        const hex = colourToHex(draft)
        if (!editable) {
          if (hex === undefined) return null
          return (
            <span aria-hidden="true" className={ADDON}>
              <Swatch hex={hex} />
            </span>
          )
        }
        if (draft.trim() !== '' && hex === undefined) return null
        return (
          <>
            <button
              type="button"
              aria-label={`Pick a colour for ${field.label}`}
              title="Pick a colour"
              className={ADDON}
              onClick={() => pickerRef.current?.showPicker()}
            >
              {hex === undefined ? (
                <PencilIcon aria-hidden="true" className="size-4" />
              ) : (
                <Swatch hex={hex} />
              )}
            </button>
            <input
              ref={pickerRef}
              type="color"
              tabIndex={-1}
              aria-hidden="true"
              className="sr-only"
              value={hex ?? '#000000'}
              onChange={(event) => write(event.currentTarget.value)}
            />
          </>
        )
      }}
    />
  )
}

function Swatch({ hex }: { hex: string }) {
  return (
    <span
      aria-hidden="true"
      className="block size-4 rounded-sm ring-1 ring-zinc-950/15 ring-inset"
      style={{ backgroundColor: hex }}
    />
  )
}
