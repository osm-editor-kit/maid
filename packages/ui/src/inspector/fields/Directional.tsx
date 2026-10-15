import { m } from '@osm-editor-kit/maid-i18n'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId, type ReactNode } from 'react'
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
import { LABEL, writeEdits } from './shared.ts'

/** The two sides, in the order they are shown */
export const DIRECTIONAL_SIDES: readonly DirectionalSide[] = ['left', 'right']

/** A side's name in the app's language: "Left" or "Right" */
export function sideLabel(side: DirectionalSide): string {
  return side === 'left' ? m.directional_side_left() : m.directional_side_right()
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
 * A field with sub fields (parking:both:orientation) is shown by DirectionalGroup instead, which
 * uses DirectionalSideCombo for each of its rows.
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
    </div>
  )
}

/**
 * One side of a directional field as a combo over the field's options, on a row with its label. The label
 * is the side's name for a field on its own, and the field's label in a group. `actions` go after the combo
 * (a group row's info, revert and remove buttons). `unusedReason`: the side is not used (a sub field whose
 * parent says so): the combo is disabled, keeps its value, and the reason is its description.
 */
export function DirectionalSideCombo(props: {
  field: Field
  side: DirectionalSide
  label: string
  tags: Tags
  combined?: CombinedTags
  /** Several features: each feature's own tags (FieldProps.features) */
  features?: readonly Tags[]
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
  actions?: ReactNode
  unusedReason?: string
  /**
   * The row takes the columns of its parent grid (CSS subgrid): the grouped block (DirectionalGroup) lines up the
   * combos of all its rows, whatever buttons each row has. On its own the row has columns of its own.
   */
  subgrid?: boolean
}) {
  const {
    field,
    side,
    label,
    tags,
    combined,
    features,
    onChange,
    onChangeTags,
    actions,
    unusedReason,
    subgrid = false,
  } = props
  const id = useId()
  const reasonId = useId()
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
  // one side's choice: a side that is not used takes none
  const choose = (next: string | undefined) =>
    writeEdits(
      { onChange, onChangeTags },
      features === undefined
        ? directionalWrite(keys, tags, side, next)
        : sideOnlyWrite(keys, tags, side, next),
    )
  return (
    <div
      className={
        subgrid
          ? 'col-span-3 grid min-w-0 grid-cols-subgrid items-center'
          : `grid min-w-0 items-center gap-2 ${actions ? 'grid-cols-[6rem_minmax(0,1fr)_auto]' : 'grid-cols-[6rem_minmax(0,1fr)]'}`
      }
      // the side's own key, for the map (PresetFields onFieldFocus); the innermost one counts
      data-focus-key={sideKey}
      data-focus-side={side}
      title={unusedReason}
    >
      <label htmlFor={id} className={LABEL} title={label}>
        {label}
      </label>
      <ComboField
        // the combo's draft starts over when this side's value changes elsewhere
        key={`${sideKey}=${value ?? ''}|${state.mixed ? JSON.stringify(state.mixed) : ''}`}
        field={sideField}
        tags={sideTags}
        combined={sideCombined}
        id={id}
        onChange={onChange && !unused ? (_key, next) => choose(next) : undefined}
        disabled={unused}
        describedBy={unused ? reasonId : undefined}
      />
      {unused ? (
        <span id={reasonId} className="sr-only">
          {unusedReason}
        </span>
      ) : null}
      {actions ? (
        <span className="flex items-center justify-end gap-1">{actions}</span>
      ) : subgrid ? (
        <span />
      ) : null}
    </div>
  )
}
