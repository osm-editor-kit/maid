import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import type { ReactNode } from 'react'
import type { AddressCandidate, Countries } from './address-logic.ts'

/**
 * One key over several features. Mirrors `Combined` in packages/model/src/util/combined-tags.ts (ui does not
 * depend on the model package, so the shape is declared here; keep the two the same).
 * `one`: every feature has the key with this value. `mixed`: the features differ; `values` are the distinct
 * values, most frequent first; `missing` is true when some feature lacks the key.
 */
export type Combined = { kind: 'one'; value: string } | MixedValue
export type MixedValue = { kind: 'mixed'; values: string[]; missing: boolean }
/** The combined tags of several features: a key no feature has is absent. Mirrors `CombinedTags` in the model. */
export type CombinedTags = Readonly<Record<string, Combined>>

export type FieldProps = {
  field: Field
  /** The tags. Several features: the values all of them share (the `one` keys); a mixed key is absent. */
  tags: Tags
  /** Several features only: how each key is over them. Absent for one feature, and then nothing is mixed. */
  combined?: CombinedTags
  /**
   * Several features only: each feature's own tags, in selection order. Only the fields that need a
   * feature's own values (access placeholders, directional sides) read it; the rest use `combined`.
   */
  features?: readonly Tags[]
  /** The id of the control, for the row's label. Set by PresetFields; components may ignore it. */
  id?: string
  /** Sets or (with undefined) removes one tag. Absent: read-only. */
  onChange?: (key: string, value: string | undefined) => void
  /**
   * Sets and removes several tags as one change: one undo step. A control that writes more than one key for one
   * choice (a side that splits `both`, a value with its `:conditional`) uses `writeEdits`, which calls this when the
   * inspector gives it and `onChange` per key otherwise.
   */
  onChangeTags?: (edits: readonly FieldTagEdit[]) => void
  /**
   * The element in the row's label bar, after the "i". A control that has buttons of its own
   * (for the label bar, not below the input) renders them into it with createPortal. Null or
   * absent: none; controls that ignore it are unaffected.
   */
  labelActions?: HTMLElement | null
  /** The address field's place: its country and the features near the feature. Only the address field reads it. */
  address?: AddressContext
}
/**
 * The address field's context from the feature: the countries of its centre (an ISO code, `de`, or the territory
 * and the country, `['hk', 'cn']`), and the features near it (address-logic.ts). Absent: the default layout and no
 * suggestions.
 */
export type AddressContext = { country?: Countries; candidates?: readonly AddressCandidate[] }
export type FieldComponent = (props: FieldProps) => ReactNode

/** One edit of one tag: `value` undefined removes the key */
export type FieldTagEdit = { key: string; value: string | undefined }

/** Writes the edits of one choice: as one change where the inspector gives `onChangeTags`, else key by key */
export function writeEdits(
  props: Pick<FieldProps, 'onChange' | 'onChangeTags'>,
  edits: readonly FieldTagEdit[],
) {
  if (edits.length === 0) return
  if (props.onChangeTags) props.onChangeTags(edits)
  else for (const edit of edits) props.onChange?.(edit.key, edit.value)
}

/** The edits as the keys to set and the keys to remove (an empty value removes), as the engine's `changeTags` takes them */
export function tagChangeOf(edits: readonly FieldTagEdit[]) {
  const set: Record<string, string> = {}
  const remove: string[] = []
  for (const { key, value } of edits) {
    if (value === undefined || value === '') remove.push(key)
    else set[key] = value
  }
  return { set, remove }
}

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
  /**
   * The side of the road the control is about. A module's own field sets it with `data-focus-side` on an element
   * (with `data-focus-key`) around its control; `both` is for a control that covers both sides. A `parking:<side>:*`
   * key needs no `side`: the shell reads it from the key.
   */
  side?: 'left' | 'right' | 'both'
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
/** A box of chips: the text input's frame without its fixed height, so the chips wrap inside it (Multi, the level section) */
export const CHIP_BOX = `${FRAME.replace(/^h-8 /, '')} flex min-h-8 flex-wrap items-center gap-1 p-1 focus-within:outline-2 focus-within:outline-blue-500`
/** One value in a box of chips */
export const CHIP =
  'flex h-6 max-w-full min-w-0 items-center gap-1 rounded-md bg-zinc-950/5 pl-1 pr-0.5 text-sm text-zinc-950 dark:bg-white/10 dark:text-white'
export const INPUT = `${FRAME} px-2 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
export const TEXTAREA = `${SURFACE} px-2 py-1.5 leading-5 placeholder:text-zinc-400 read-only:cursor-default dark:placeholder:text-zinc-500`
/** Over the length limit a text control has a red border and ring. useLengthLimit sets aria-invalid. */
export const LIMITED =
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-1 aria-[invalid=true]:ring-red-500 dark:aria-[invalid=true]:border-red-400 dark:aria-[invalid=true]:ring-red-400'
export const LABEL = 'min-w-0 truncate text-sm text-zinc-700 dark:text-zinc-300'
/** A small icon button in a row's label bar (revert, remove, add a language). */
export const ROW_BUTTON =
  'grid size-5 shrink-0 place-items-center rounded text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
export const HINT = 'min-w-0 truncate text-xs text-zinc-500 dark:text-zinc-400'

/**
 * For the buttons of a row's label bar: they fade in while the pointer or the focus is in the row
 * (the row is the named group `field`), stay while their panel is open or they are pressed, and
 * are always there on touch.
 */
export const REVEAL =
  'opacity-0 transition-opacity duration-200 group-focus-within/field:opacity-100 group-hover/field:opacity-100 aria-expanded:opacity-100 aria-pressed:opacity-100 has-[[aria-expanded=true]]:opacity-100 pointer-coarse:opacity-100'
