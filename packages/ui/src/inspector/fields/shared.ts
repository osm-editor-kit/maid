import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { ReactNode } from 'react'

export type FieldProps = {
  field: Field
  tags: Tags
  /** The id of the control, for the row's label. Set by PresetFields; components may ignore it. */
  id?: string
  /** Sets or (with undefined) removes one tag. Absent: read-only. */
  onChange?: (key: string, value: string | undefined) => void
}
export type FieldComponent = (props: FieldProps) => ReactNode

const SURFACE =
  'w-full min-w-0 rounded-md border border-zinc-950/10 bg-white text-sm text-zinc-950 hover:border-zinc-950/20 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950 dark:text-white dark:hover:border-white/20 dark:[color-scheme:dark]'
export const FRAME = `h-8 ${SURFACE}`
export const INPUT = `${FRAME} px-2 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
export const TEXTAREA = `${SURFACE} px-2 py-1.5 leading-5 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
export const LABEL = 'min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-300'
export const HINT = 'min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400'
