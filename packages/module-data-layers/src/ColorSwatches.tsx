/**
 * The colour of a layer as a row of small swatches: the palette as a radio group (arrow keys move
 * and choose), then one swatch that opens the native colour picker for any other colour.
 */
import { PencilIcon } from '@heroicons/react/16/solid'
import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import type { CSSProperties, KeyboardEvent } from 'react'
import { PALETTE } from './config.ts'
import { colourName, stepIndex, swatchIndex } from './swatch.ts'

const SWATCH =
  'relative inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-full inset-ring inset-ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:inset-ring-white/10'

/** The chosen swatch gets a ring in its own colour, set apart from the swatch by a gap */
const CHOSEN = 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-zinc-900'

function ringColour(color: string) {
  return { '--tw-ring-color': color } as CSSProperties
}

export function ColorSwatches({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (color: string) => void
}) {
  const chosen = swatchIndex(value, PALETTE)
  const custom = chosen === -1
  // the chosen swatch is the one tab stop; with a custom colour the first palette swatch is
  const tabStop = custom ? 0 : chosen

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = stepIndex(index, PALETTE.length, event.key)
    if (next === undefined) return
    event.preventDefault()
    const color = PALETTE[next]
    if (color !== undefined) onChange(color)
    const target = event.currentTarget.parentElement?.children[next]
    if (target instanceof HTMLElement) target.focus()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-2">
        {PALETTE.map((color, index) => {
          const checked = index === chosen
          return (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={colourName(color)}
              title={colourName(color)}
              tabIndex={index === tabStop ? 0 : -1}
              onClick={() => onChange(color)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`${SWATCH} ${checked ? CHOSEN : ''}`}
              style={{ backgroundColor: color, ...(checked ? ringColour(color) : {}) }}
            />
          )
        })}
      </div>
      <label
        title={custom ? `Custom colour ${value}` : 'Custom colour'}
        className={`${SWATCH} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue-500 ${custom ? CHOSEN : 'bg-white dark:bg-zinc-800'}`}
        style={custom ? { backgroundColor: value, ...ringColour(value) } : undefined}
      >
        <input
          {...PLAIN_INPUT}
          type="color"
          aria-label="Custom colour"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
        <PencilIcon
          aria-hidden="true"
          className={`pointer-events-none size-3 ${custom ? 'text-white drop-shadow-sm' : 'text-zinc-500 dark:text-zinc-400'}`}
        />
      </label>
    </div>
  )
}
