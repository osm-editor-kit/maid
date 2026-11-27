import { XMarkIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { ComboField } from './Combo.tsx'
import {
  directionalKeys,
  directionalWrite,
  sideOnlyWrite,
  sideStates,
  type DirectionalSide,
} from './directional-logic.ts'
import { FallbackField } from './Fallback.tsx'
import type { CombinedTags, FieldProps } from './shared.ts'
import { LABEL, ROW_BUTTON, writeEdits } from './shared.ts'

/** The two sides, in the order they are shown */
export const DIRECTIONAL_SIDES: readonly DirectionalSide[] = ['left', 'right']

/** A side's name in the app's language: "Left" or "Right" */
export function sideLabel(side: DirectionalSide): string {
  return side === 'left' ? m.directional_side_left() : m.directional_side_right()
}

/**
 * Whether the way's traffic runs against its drawing direction (`oneway=-1`), for every feature when there are several.
 * Left and right keep following the drawing direction (OSM wiki, Forward & backward, left & right): nothing flips,
 * but the mapper looking along the traffic sees them swapped, so the field says so (ReversedHint).
 */
export function runsAgainstLine(tags: Tags, features?: readonly Tags[]) {
  const reversed = (t: Tags) => t.oneway === '-1'
  return features === undefined ? reversed(tags) : features.length > 0 && features.every(reversed)
}

/** The hint under a directional field on a way with `oneway=-1` (runsAgainstLine) */
export function ReversedHint(props: { tags: Tags; features?: readonly Tags[] }) {
  if (!runsAgainstLine(props.tags, props.features)) return null
  return (
    <p className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400" data-reversed-hint>
      {m.directional_reversed_hint()}
    </p>
  )
}

/**
 * A value for each side of a field that has a left and a right tag (cycleway, sidewalk:both,
 * parking:both, parking:both:orientation). Two combos, Left and Right, each over the field's
 * options. The side shows its own key, or what the common keys say (sideStates); a choice writes the
 * tags as iD does (directionalWrite), all changed keys as one change (writeEdits). Each combo keeps its draft while
 * the other side is edited. Read-only without onChange.
 * Several features: each side is summarised over the features' own tags (`features`); a side that the
 * features differ on is mixed (placeholder "Multiple values"). A choice then writes only that side's
 * key, on all of them (sideOnlyWrite).
 *
 * Row.tsx keys the control by the field's tag values; the type is listed in STEADY_TYPES so that
 * the combos keep the focus when a write from one side changes the tags.
 * In the field list every directional field is shown by SidedFieldBlock instead (SidedField.tsx), which uses
 * SideComboInput for each side; this field is for a directional field shown on its own.
 */
export function DirectionalComboField(props: FieldProps) {
  const { field, tags, onChange, onChangeTags, combined, features } = props
  if (field.key === undefined) return <FallbackField {...props} />
  return (
    <div className="grid min-w-0 gap-1.5">
      {DIRECTIONAL_SIDES.map((side) => (
        <DirectionalSideCombo
          key={side}
          field={field}
          side={side}
          label={sideLabel(side)}
          tags={tags}
          combined={combined}
          features={features}
          onChange={onChange}
          onChangeTags={onChangeTags}
        />
      ))}
      <ReversedHint tags={tags} features={features} />
    </div>
  )
}

/** One side of a directional field on its own: the side's name, then its combo (SideComboInput) */
function DirectionalSideCombo(props: {
  field: Field
  side: DirectionalSide
  label: string
  tags: Tags
  combined?: CombinedTags
  /** Several features: each feature's own tags (FieldProps.features) */
  features?: readonly Tags[]
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
}) {
  const { field, side, label } = props
  const id = useId()
  const key = field.key
  if (key === undefined) return null
  const sideKey = side === 'left' ? directionalKeys(key).left : directionalKeys(key).right
  return (
    <div
      className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2"
      // the side's own key, for the map (PresetFields onFieldFocus); the innermost one counts
      data-focus-key={sideKey}
      data-focus-side={side}
    >
      <label htmlFor={id} className={LABEL} title={label}>
        {label}
      </label>
      <SideComboInput id={id} {...props} />
    </div>
  )
}

/**
 * The combo of one side of a directional field, without a row around it: the field's options over the side's key
 * (`label` names it for the combo). The side shows its own key, or what the common keys say (sideStates); a choice
 * writes the tags as iD does (directionalWrite), several features only the side's key (sideOnlyWrite). `unusedReason`:
 * the side is not used (a sub field whose parent says so): the combo is disabled, keeps its value, and the reason is
 * its description. `staleHint`: what to do about a value that is left on such a side (remove it; move it to the
 * separately mapped way): the value is shown as an error with the hint and a button that removes just this side's
 * value, the only edit the side takes. Used by a side's row (DirectionalSideCombo) and by a side of a sided field
 * (SidedField.tsx).
 */
export function SideComboInput(props: {
  id: string
  field: Field
  side: DirectionalSide
  label: string
  tags: Tags
  combined?: CombinedTags
  features?: readonly Tags[]
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
  unusedReason?: string
  staleHint?: string
}) {
  const {
    id,
    field,
    side,
    label,
    tags,
    combined,
    features,
    onChange,
    onChangeTags,
    unusedReason,
    staleHint,
  } = props
  const reasonId = useId()
  const staleId = useId()
  const key = field.key
  if (key === undefined) return null
  const keys = directionalKeys(key)
  const state = sideStates(keys, tags, combined, features)[side]
  const sideKey = side === 'left' ? keys.left : keys.right
  // A combo over the side's key: the field's options and spelling rules, its own label
  const sideField: Field = {
    ...field,
    id: `${field.id}-${side}`,
    type: 'combo',
    key: sideKey,
    label,
  }
  const value = state.value
  const sideTags: Tags = value === undefined ? {} : { [sideKey]: value }
  // a mixed side is shown by the combo as a mixed key of its own
  const sideCombined: CombinedTags | undefined = state.mixed
    ? { [sideKey]: state.mixed }
    : undefined
  const unused = unusedReason !== undefined
  // a value that stays on a side that is not used is an error, cleared for this side alone
  const stale =
    unused && staleHint !== undefined && (value !== undefined || state.mixed !== undefined)
  // one side's choice: a side that is not used takes none
  const choose = (next: string | undefined) =>
    writeEdits(
      { onChange, onChangeTags },
      features === undefined
        ? directionalWrite(keys, tags, side, next)
        : sideOnlyWrite(keys, tags, side, next),
    )
  // the button of a stale value: clears this side alone; several features: the side's key on all of them, a mixed one too
  const clear = () =>
    writeEdits(
      { onChange, onChangeTags },
      features === undefined
        ? directionalWrite(keys, tags, side, undefined)
        : [{ key: sideKey, value: undefined }],
    )
  // several features write one edit for all: it can clear only a value stored under the side's own key. A value that
  // comes from `:both` or the common key of some feature needs that feature alone, so there is no button then
  const clearable =
    features === undefined || features.some((featureTags) => featureTags[sideKey] !== undefined)
  return (
    <>
      <ComboField
        // no key by the value: the combo starts its draft over when the value changes (ComboInput) and keeps its focus
        field={sideField}
        tags={sideTags}
        combined={sideCombined}
        id={id}
        onChange={onChange && !unused ? (_key, next) => choose(next) : undefined}
        disabled={unused}
        invalid={stale}
        describedBy={stale ? staleId : unused ? reasonId : undefined}
      />
      {unused ? (
        <span id={reasonId} className="sr-only">
          {unusedReason}
        </span>
      ) : null}
      {stale ? (
        <p className="flex min-w-0 items-start gap-1 text-xs text-red-600 dark:text-red-400">
          <span id={staleId} className="min-w-0 flex-1">
            {staleHint}
          </span>
          {onChange && clearable ? (
            <button
              type="button"
              aria-label={m.ui_remove_named({ label })}
              title={m.ui_remove_named({ label })}
              className={ROW_BUTTON}
              onClick={clear}
            >
              <XMarkIcon aria-hidden="true" className="size-4" />
            </button>
          ) : null}
        </p>
      ) : null}
    </>
  )
}
