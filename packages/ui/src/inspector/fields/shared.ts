import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { ReactNode } from 'react'

export type FieldProps = {
  field: Field
  tags: Tags
  /** The id of the control, for the row's label. Set by PresetFields; components may ignore it. */
  id?: string
  /** Sets or (with undefined) removes one tag. Absent: read-only. */
  onChange?: (key: string, value: string | undefined) => void
  /**
   * The element in the row's label bar, after the "i". A control that has buttons of its own
   * (for the label bar, not below the input) renders them into it with createPortal. Null or
   * absent: none; controls that ignore it are unaffected.
   */
  labelActions?: HTMLElement | null
}
export type FieldComponent = (props: FieldProps) => ReactNode

/**
 * The control that has the focus or the pointer on it, as the map needs it (PresetFields
 * onFieldFocus). `key` is the tag the control is about: a directional field's side has its own
 * key (`cycleway:left`) and `side`; a width field has its key and no side.
 */
export type FieldFocus = {
  fieldId: string
  key: string
  /** The control's text (its draft while it is edited), else the tag's value */
  value: string | undefined
  side?: 'left' | 'right'
}

/**
 * The measuring tape of the width fields (PresetFields `measure`): `can` says whether a key has the
 * "Measure on the map" button, `start` begins a measure for it, and `active` is the key being
 * measured now (the button is pressed then).
 */
export type FieldMeasure = {
  can: (key: string) => boolean
  start: (key: string) => void
  active?: string
}

const SURFACE =
  'w-full min-w-0 rounded-md border border-zinc-950/10 bg-white text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'
export const FRAME = `h-8 ${SURFACE}`
export const INPUT = `${FRAME} px-2 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
export const TEXTAREA = `${SURFACE} px-2 py-1.5 leading-5 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
export const LABEL = 'min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-300'
/** A small icon button in a row's label bar (revert, remove, add a language). */
export const ROW_BUTTON =
  'grid size-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
export const HINT = 'min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400'
