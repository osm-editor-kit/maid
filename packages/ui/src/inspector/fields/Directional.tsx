import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useId } from 'react'
import { ComboField } from './Combo.tsx'
import {
  directionalKeys,
  directionalWrite,
  sideOnlyWrite,
  sideStates,
  type DirectionalKeys,
  type DirectionalSide,
  type SideState,
} from './directional-logic.ts'
import { FallbackField } from './Fallback.tsx'
import type { CombinedTags, FieldProps } from './shared.ts'
import { LABEL, writeEdits } from './shared.ts'

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
 */
export function DirectionalComboField(props: FieldProps) {
  const { field, tags, onChange, onChangeTags, combined, features } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const keys = directionalKeys(key)
  const sides = sideStates(keys, tags, combined, features)
  // a choice can change several keys (the side, the common key, the other side): one change
  const write = (side: DirectionalSide, next: string | undefined) =>
    writeEdits(
      { onChange, onChangeTags },
      features === undefined
        ? directionalWrite(keys, tags, side, next)
        : sideOnlyWrite(keys, tags, side, next),
    )
  return (
    <div className="grid min-w-0 gap-1.5">
      <SideRow
        field={field}
        side="left"
        label="Left"
        keys={keys}
        state={sides.left}
        write={onChange ? write : undefined}
      />
      <SideRow
        field={field}
        side="right"
        label="Right"
        keys={keys}
        state={sides.right}
        write={onChange ? write : undefined}
      />
    </div>
  )
}

function SideRow(props: {
  field: Field
  side: DirectionalSide
  label: string
  keys: DirectionalKeys
  state: SideState
  /** Writes a choice of this side. Absent: read-only. */
  write: ((side: DirectionalSide, next: string | undefined) => void) | undefined
}) {
  const { field, side, label, keys, state, write } = props
  const id = useId()
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
  return (
    <div
      className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2"
      // the side's own key, for the map (PresetFields onFieldFocus); the innermost one counts
      data-focus-key={sideKey}
      data-focus-side={side}
    >
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <ComboField
        // the combo's draft starts over when this side's value changes elsewhere
        key={`${sideKey}=${value ?? ''}|${state.mixed ? JSON.stringify(state.mixed) : ''}`}
        field={sideField}
        tags={sideTags}
        combined={sideCombined}
        id={id}
        onChange={write ? (_key, next) => write(side, next) : undefined}
      />
    </div>
  )
}
