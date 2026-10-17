import { PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
/**
 * The sidebar field for `traffic_sign*` keys.
 *
 * The sign picker is `TrafficSignField` from `@osm-editor-kit/osm-traffic-sign-field` (no Maid import there; texts
 * and the country come in as props). It is loaded on first use with `lazy`, so the sign code and the country's
 * catalogue are not in the editor's first load. While it loads, and for a feature it cannot show, the plain text
 * input below stands in. Nothing is requested from the network: the catalogue and the SVGs are bundled chunks.
 */
import type { InspectorFieldType } from '@osm-editor-kit/maid-ui'
import type { Country } from '@osm-editor-kit/osm-traffic-sign-field'
import { lazy, Suspense } from 'react'
import { applySignTagChanges } from './tag-changes.ts'
import { trafficSignTexts } from './texts.ts'

export type FieldComponent = InspectorFieldType['component']
export type FieldProps = Parameters<FieldComponent>[0]
/** `country` is the country the signs of the field are read from (`DE` by default) */
export type SignFieldProps = FieldProps & { country: string }

const INPUT_CLASS =
  'h-8 w-full min-w-0 rounded-md border border-zinc-950/10 bg-white px-2 text-sm text-zinc-950 placeholder:text-zinc-400 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 read-only:cursor-default dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:placeholder:text-zinc-500 dark:hover:border-white/20 dark:[color-scheme:dark]'

const SignPicker = lazy(async () => {
  const { TrafficSignField: Picker } = await import('@osm-editor-kit/osm-traffic-sign-field')
  return { default: Picker }
})

/**
 * The value is committed on blur or Enter, like Maid's text fields. The row keys this control by its tag value
 * (the type is not in STEADY_TYPES), so the input is new whenever the value changes from outside.
 */
export function TrafficSignField(props: SignFieldProps) {
  const { field, tags, id, onChange, combined, country } = props
  const key = field.key ?? field.id
  const mixed = combined?.[key]?.kind === 'mixed'
  return (
    <Suspense fallback={<PlainSignInput {...props} />}>
      <SignPicker
        id={id}
        value={tags[key]}
        // the module option is any string; the picker falls back to DE for a country it has no data for
        country={country as Country}
        readOnly={!onChange}
        mixed={mixed}
        texts={trafficSignTexts()}
        onChange={onChange ? (value) => applySignTagChanges({ [key]: value }, onChange) : undefined}
      />
    </Suspense>
  )
}

/** The text input of the value: the stand-in while the picker loads */
function PlainSignInput({ field, tags, id, onChange }: SignFieldProps) {
  const key = field.key ?? field.id
  const current = tags[key] ?? ''

  return (
    <input
      {...PLAIN_INPUT}
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
