/**
 * The sidebar field for `traffic_sign*` keys.
 *
 * Only the fallback is here: a plain text input for the key's value. The package
 * (`@osm-traffic-signs/id-field`) is not mounted yet: its factory needs a d3 selection from its host (d3-selection,
 * which the package does not declare and Maid does not install) and the converter, which is a declared peer and is
 * not installed. See README.md, "Not done". The fallback loads nothing from the network.
 */
import type { InspectorFieldType } from '@osm-editor-kit/maid-ui'
import type { ReactNode } from 'react'
import { applySignTagChanges } from './tag-changes.ts'

export type FieldComponent = InspectorFieldType['component']
export type FieldProps = Parameters<FieldComponent>[0]
/** `country` is the country the signs of the field are read from (`DE` by default); the fallback does not use it yet */
export type SignFieldProps = FieldProps & { country: string }

const INPUT_CLASS =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 read-only:cursor-default dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'

/**
 * The value is committed on blur or Enter, like Maid's text fields. The row keys this control by its tag value
 * (the type is not in STEADY_TYPES), so the input is new whenever the value changes from outside.
 */
export function TrafficSignField({ field, tags, id, onChange }: SignFieldProps): ReactNode {
  const key = field.key ?? field.id
  const current = tags[key] ?? ''

  return (
    <input
      id={id}
      type="text"
      dir="auto"
      className={INPUT_CLASS}
      defaultValue={current}
      readOnly={!onChange}
      placeholder="e.g. DE:274-30"
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      onBlur={(event) => {
        if (!onChange) return
        const value = event.currentTarget.value.trim()
        if (value === current) return
        applySignTagChanges({ [key]: value }, onChange)
      }}
    />
  )
}

/** The component the module registers: the field with the country it reads its signs from */
export function signFieldComponent(country: string): FieldComponent {
  return (props) => <TrafficSignField {...props} country={country} />
}
