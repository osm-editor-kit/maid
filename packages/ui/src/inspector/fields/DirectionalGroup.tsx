import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { showsDirectionRotateHint } from '@osm-editor-kit/maid-renderer'
import { useId } from 'react'
import { InfoPopover, type ReferenceLoader } from '../../InfoPopover.tsx'
import { isModified, isPresent, removeEdits, revertEdits, type TagEdit } from '../logic.ts'
import { shownText } from './combo-logic.ts'
import { unusedSides } from './directional-group-logic.ts'
import { directionalKeys, sideStates, type DirectionalSide } from './directional-logic.ts'
import { DIRECTIONAL_SIDES, DirectionalSideCombo, sideLabel } from './Directional.tsx'
import { mixedKeysOf } from './mixed-logic.ts'
import { RelatedAddButtons, RelatedDetails, type RelatedRow } from './Related.tsx'
import { ACTION_BUTTON, INFO_BUTTON } from './Row.tsx'
import { writeEdits, type CombinedTags, type FieldProps } from './shared.ts'

/**
 * A directional field and its sub fields as one block (parking:both and parking:both:orientation): under
 * each side, Left and Right, a row per field. A row is that field's combo over the side (DirectionalSideCombo,
 * as the field has it on its own) with its info, revert and remove buttons. A sub field's side is not used when
 * the parent says so (unusedSides): its combo is disabled and says why. The related tags of each field are
 * shown once below the block; their add buttons are on each row, as the field's own buttons are.
 */
export function DirectionalGroup(props: {
  /** The parent and its sub fields, in the order of the preset (the parent first) */
  parent: Field
  subs: readonly Field[]
  tags: Tags
  /** Several features: how each key is over them (FieldProps.combined) */
  combined?: CombinedTags
  /** Several features: each feature's own tags (FieldProps.features) */
  features?: readonly Tags[]
  /** The tags before any edit: a field that differs from them has a revert button */
  baseTags?: Tags
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
  loadReference?: ReferenceLoader
  /** The related tags of a field (PresetFields). Absent: none. */
  related?: (field: Field) => RelatedRow
}) {
  const {
    parent,
    subs,
    tags,
    combined,
    features,
    baseTags,
    onChange,
    onChangeTags,
    loadReference,
    related,
  } = props
  const fields = [parent, ...subs]
  // the parent's sides as the parent reads them; a side that several features differ on is mixed, so it is used
  const parentSides =
    parent.key === undefined
      ? undefined
      : sideStates(directionalKeys(parent.key), tags, combined, features)
  const unused = parentSides === undefined ? undefined : unusedSides(parentSides)
  /** Why a sub field's side is not used: the parent's value there, as its option label */
  const unusedReason = (side: DirectionalSide, field: Field): string | undefined => {
    if (field === parent || unused === undefined || !unused[side] || parentSides === undefined)
      return undefined
    return m.directional_unused_hint({
      field: parent.label,
      value: shownText(parent, parentSides[side].value).text,
    })
  }
  return (
    <div className="grid min-w-0 gap-3">
      {DIRECTIONAL_SIDES.map((side) => (
        <GroupSide
          key={side}
          side={side}
          fields={fields}
          unusedReason={(field) => unusedReason(side, field)}
          tags={tags}
          combined={combined}
          features={features}
          baseTags={baseTags}
          onChange={onChange}
          onChangeTags={onChangeTags}
          loadReference={loadReference}
          related={related}
        />
      ))}
      {related
        ? fields.map((field) => (
            <RelatedDetails
              key={field.id}
              field={field}
              tags={tags}
              related={related(field)}
              onChange={onChange}
            />
          ))
        : null}
    </div>
  )
}

/** One side of the block: its name, then a row per field */
function GroupSide(props: {
  side: DirectionalSide
  fields: readonly Field[]
  unusedReason: (field: Field) => string | undefined
  tags: Tags
  combined?: CombinedTags
  features?: readonly Tags[]
  baseTags?: Tags
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
  loadReference?: ReferenceLoader
  related?: (field: Field) => RelatedRow
}) {
  const { side, fields, unusedReason, ...rest } = props
  const headingId = useId()
  return (
    // one grid for the side's rows (label, combo, buttons), so the combos of all rows have the same width
    <div
      role="group"
      aria-labelledby={headingId}
      className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)_auto] gap-x-2 gap-y-1.5"
    >
      <div id={headingId} className="col-span-3 text-sm font-medium text-zinc-950 dark:text-white">
        {sideLabel(side)}
      </div>
      {fields.map((field) => (
        // the row is the named group `field`: its buttons show while the pointer or the focus is in it
        <div
          key={field.id}
          data-field-id={field.id}
          className="group/field col-span-3 grid min-w-0 grid-cols-subgrid"
        >
          <GroupRow field={field} side={side} unusedReason={unusedReason(field)} {...rest} />
        </div>
      ))}
    </div>
  )
}

/** A field's combo over one side, with the field's buttons after it (as FieldRow shows them on the field's row) */
function GroupRow(props: {
  field: Field
  side: DirectionalSide
  unusedReason: string | undefined
  tags: Tags
  combined?: CombinedTags
  features?: readonly Tags[]
  baseTags?: Tags
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
  loadReference?: ReferenceLoader
  related?: (field: Field) => RelatedRow
}) {
  const {
    field,
    side,
    unusedReason,
    tags,
    combined,
    features,
    baseTags,
    onChange,
    onChangeTags,
    loadReference,
    related,
  } = props
  // revert and remove touch the whole field, as on its own row; a mixed key has no single base value to revert to
  const mixedKeys = mixedKeysOf(field, combined)
  const present = isPresent(field, tags) || mixedKeys.length > 0
  const modified = baseTags !== undefined && isModified(field, tags, baseTags)
  const apply = (edits: TagEdit[]) => writeEdits({ onChange, onChangeTags }, edits)
  const actions = (
    <>
      {field.reference ? (
        <InfoPopover
          label={field.label}
          reference={field.reference}
          load={loadReference}
          buttonClassName={INFO_BUTTON}
          hint={
            showsDirectionRotateHint({ key: field.key, fieldType: field.type })
              ? m.direction_rotate_hint({ key: 'R' })
              : undefined
          }
        />
      ) : null}
      {onChange && related ? <RelatedAddButtons field={field} related={related(field)} /> : null}
      {onChange && modified && baseTags && mixedKeys.length === 0 ? (
        <button
          type="button"
          aria-label={`Revert ${field.label}`}
          title={`Revert ${field.label}`}
          className={ACTION_BUTTON}
          onClick={() => apply(revertEdits(field, tags, baseTags))}
        >
          <ArrowUturnLeftIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      {onChange && present ? (
        <button
          type="button"
          aria-label={`Remove ${field.label}`}
          title={`Remove ${field.label}`}
          className={ACTION_BUTTON}
          onClick={() =>
            apply([
              ...removeEdits(field, tags),
              ...mixedKeys.map((tagKey) => ({ key: tagKey, value: undefined })),
            ])
          }
        >
          <TrashIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </>
  )
  return (
    <DirectionalSideCombo
      subgrid
      field={field}
      side={side}
      label={field.label}
      tags={tags}
      combined={combined}
      features={features}
      onChange={onChange}
      onChangeTags={onChangeTags}
      actions={actions}
      unusedReason={unusedReason}
    />
  )
}
