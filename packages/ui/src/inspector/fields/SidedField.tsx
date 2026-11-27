import { ArrowUturnLeftIcon, TrashIcon } from '@heroicons/react/16/solid'
import { device, m } from '@osm-editor-kit/maid-i18n'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { showsDirectionRotateHint } from '@osm-editor-kit/maid-renderer'
import { useId, useState } from 'react'
import { useBearing } from '../../bearing.ts'
import { InfoPopover, type ReferenceLoader } from '../../InfoPopover.tsx'
import { useWayHeading } from '../../way-heading.ts'
import { isModified, isPresent, removeEdits, revertEdits, type TagEdit } from '../logic.ts'
import { shownText } from './combo-logic.ts'
import { disabledSubSides, type SidedRow } from './directional-group-logic.ts'
import { directionalKeys, sideStates, type DirectionalSide } from './directional-logic.ts'
import { DIRECTIONAL_SIDES, ReversedHint, SideComboInput, sideLabel } from './Directional.tsx'
import { mixedKeysOf } from './mixed-logic.ts'
import { RelatedAddButtons, RelatedDetails, type RelatedRow } from './Related.tsx'
import { ACTION_BUTTON, INFO_BUTTON } from './Row.tsx'
import { LABEL, writeEdits, type CombinedTags, type FieldProps } from './shared.ts'
import { sideCompass, type CompassPoint } from './side-compass.ts'
import { sideOffError } from './side-off.ts'

type BlockProps = {
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
}

/** The look of "Left" and "Right" in a title line: quieter than the field's name, so the name stands out */
const SIDE_WORD = 'shrink-0 text-xs leading-5 text-zinc-500 dark:text-zinc-400'

/**
 * The inset of a side word from its column's edge: the combo's text inset (ComboInput's px-2), so "Left" ends where the
 * left value can end and "Right" starts where the right value starts
 */
const SIDE_INSET = { left: 'pr-2', right: 'pl-2' } as const

/**
 * A field that has a left and a right side (bike lanes, sidewalks, parking, …), with its sub fields (parking
 * orientation) as rows under it, at the field's place in the list (Tobias, 2026-11-27). A row is a title line, then the
 * two sides side by side, each the field's combo over that side (SideComboInput). The title line is the head of the two
 * columns: "Parking Left" over the left one, "Right" over the right one, the name once. A sub row's name starts with
 * an arrow and runs over both columns, without Left and Right (the row above names the sides); a side its parent does
 * not use is disabled and says why. While a side's combo has the focus, the right end of the title line shows which
 * side that is on the map (SidePiece). The related tags of each field are shown once below the block.
 */
export function SidedFieldBlock(props: BlockProps & { rows: readonly SidedRow[] }) {
  const { rows, tags, features, onChange, related } = props
  return (
    <div className="grid min-w-0 gap-2.5" data-sided-field>
      {rows.map((row) => (
        <SidedFieldRow key={row.field.id} row={row} {...props} />
      ))}
      <ReversedHint tags={tags} features={features} />
      {related
        ? rows.map((row) => (
            <RelatedDetails
              key={row.field.id}
              field={row.field}
              tags={tags}
              related={related(row.field)}
              onChange={onChange}
            />
          ))
        : null}
    </div>
  )
}

/** One field: the title line (name and Left, Right, the side piece and the buttons), then a combo per side */
function SidedFieldRow(props: BlockProps & { row: SidedRow }) {
  const { row, tags, combined, features, onChange, onChangeTags } = props
  const { field, parent } = row
  const unused = unusedReasonsOf(row, tags, combined, features)
  // the side whose combo has the focus: the title line shows it on the piece of the way
  const [focused, setFocused] = useState<DirectionalSide | undefined>(undefined)
  const ids = { left: useId(), right: useId() }
  // the side piece while a side has the focus, and the field's buttons, at the end of the title line
  const buttons = (
    <span className="ml-auto flex shrink-0 items-center gap-1 self-center">
      {focused ? <SidePiece side={focused} /> : null}
      <RowActions {...props} field={field} />
    </span>
  )
  return (
    // the row is the named group `field`: its buttons show while the pointer or the focus is in it
    <div
      role="group"
      aria-label={field.label}
      data-field-id={field.id}
      data-sub-row={parent ? '' : undefined}
      className="group/field grid min-w-0 grid-cols-2 items-center gap-x-2 gap-y-1"
      onFocus={(event) => {
        const side = (event.target as Element).closest<HTMLElement>('[data-focus-side]')?.dataset
          .focusSide
        setFocused(side === 'left' || side === 'right' ? side : undefined)
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(undefined)
      }}
    >
      {parent ? (
        // a sub row: its name runs over both columns, without Left and Right; the words of the row above say it
        <div className="col-span-2 flex min-w-0 items-baseline gap-1.5">
          <span aria-hidden="true" className="shrink-0 text-zinc-400 dark:text-zinc-500">
            ↳
          </span>
          <label htmlFor={ids.left} className={`${LABEL} truncate`} title={field.label}>
            {field.label}
          </label>
          {buttons}
        </div>
      ) : (
        <>
          <div className="flex min-w-0 items-baseline self-baseline">
            <label
              htmlFor={ids.left}
              // "Left" at the end of its column, next to "Right": the two side words face each other across the gap
              className={`${LABEL} flex min-w-0 flex-1 items-baseline justify-between gap-1.5`}
            >
              <span className="truncate" title={field.label}>
                {field.label}
              </span>
              <span className={`${SIDE_WORD} ${SIDE_INSET.left}`}>{sideLabel('left')}</span>
            </label>
          </div>
          <div className="flex min-w-0 items-baseline gap-1 self-baseline">
            <label htmlFor={ids.right} className={`${SIDE_WORD} ${SIDE_INSET.right} truncate`}>
              {sideLabel('right')}
            </label>
            {buttons}
          </div>
        </>
      )}
      {DIRECTIONAL_SIDES.map((side) => (
        <SideCell
          key={side}
          id={ids[side]}
          field={field}
          side={side}
          unusedReason={unused[side]?.reason}
          staleHint={unused[side]?.staleHint}
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

/** Why a side of a sub row is not used, and what to do about a value left there */
type UnusedSide = {
  /** The parent's value there, as its option label */
  reason: string
  /** Remove it (no, none) or move it to the separately mapped way (separate), as the Tags sheet says it */
  staleHint: string
}

/**
 * The sides of a sub row that are not used: the parent's side is off (no, none, separate) and the sub field is not one
 * that stays valid there (disabledSubSides, the list of the Tags sheet). A side that is used has no entry.
 */
function unusedReasonsOf(
  row: SidedRow,
  tags: Tags,
  combined: CombinedTags | undefined,
  features: readonly Tags[] | undefined,
): Record<DirectionalSide, UnusedSide | undefined> {
  const { parent, field } = row
  if (parent?.key === undefined) return { left: undefined, right: undefined }
  const parentKeys = directionalKeys(parent.key)
  // the parent's sides as the parent reads them; a side that several features differ on is mixed, so it is used
  const sides = sideStates(parentKeys, tags, combined, features)
  const disabled = disabledSubSides(parent, field, sides)
  const unused = (side: DirectionalSide): UnusedSide | undefined => {
    const off = disabled[side]
    if (off === undefined) return undefined
    return {
      reason: m.directional_unused_hint({
        field: parent.label,
        value: shownText(parent, sides[side].value).text,
      }),
      staleHint: sideOffError(off, parentKeys[side]),
    }
  }
  return { left: unused('left'), right: unused('right') }
}

/** A side's combo; its label is the title line's word over it, "<field>, <side>" for a screen reader */
function SideCell(props: {
  id: string
  field: Field
  side: DirectionalSide
  unusedReason: string | undefined
  staleHint: string | undefined
  tags: Tags
  combined?: CombinedTags
  features?: readonly Tags[]
  onChange: FieldProps['onChange']
  onChangeTags?: FieldProps['onChangeTags']
}) {
  const { field, side, unusedReason } = props
  const key = field.key
  if (key === undefined) return <span />
  const keys = directionalKeys(key)
  return (
    <div
      className="min-w-0"
      // the side's own key, for the map (PresetFields onFieldFocus); the innermost one counts
      data-focus-key={side === 'left' ? keys.left : keys.right}
      data-focus-side={side}
      title={unusedReason}
    >
      <SideComboInput label={`${field.label}, ${sideLabel(side)}`} {...props} />
    </div>
  )
}

/** The long name of a compass point in the app's language */
function compassName(point: CompassPoint): string {
  const names = {
    n: m.compass_n,
    ne: m.compass_ne,
    e: m.compass_e,
    se: m.compass_se,
    s: m.compass_s,
    sw: m.compass_sw,
    w: m.compass_w,
    nw: m.compass_nw,
  }
  return names[point]()
}

/**
 * Which side the focused combo is on, as a piece of the way, 18 px: a grey line with an arrow head in the drawing
 * direction, and the side as a blue line beside it (the blue of the map's side line, renderer layers.ts FIELD_BLUE).
 * It turns as the selected way runs on screen (useWayHeading: the main direction of the part in view), so it turns with
 * the map. Its description names the compass point the side faces. Without a heading (several features, the way out
 * of view) it points up, as the drawing direction, and has no compass point.
 */
function SidePiece(props: { side: DirectionalSide }) {
  const { side } = props
  const heading = useWayHeading()
  const bearing = useBearing()
  const shown = sideCompass(heading, bearing, side)
  const rotation = shown?.rotation ?? 0
  const description = shown
    ? m.sided_head_title({ side: sideLabel(side), direction: compassName(shown.compass) })
    : sideLabel(side)
  const x = side === 'left' ? -4 : 4
  return (
    <span
      className="grid size-5 shrink-0 place-items-center"
      title={description}
      data-side-piece={side}
      data-compass={shown?.compass}
      data-rotation={rotation}
    >
      <svg
        role="img"
        aria-label={description}
        viewBox="-9 -9 18 18"
        className="size-[18px] text-zinc-500 dark:text-zinc-400"
      >
        <g transform={`rotate(${rotation})`} strokeLinecap="round" fill="none">
          <path d="M0 7.5 V-7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M-2.5 -4.5 L0 -7.5 L2.5 -4.5" stroke="currentColor" strokeWidth="1.5" />
          <path d={`M${x} 6 V-6`} stroke="#2563eb" strokeWidth="2.5" />
        </g>
      </svg>
    </span>
  )
}

/** A field's info, related-tag, revert and remove buttons, as FieldRow shows them on the field's row */
function RowActions(props: BlockProps & { field: Field }) {
  const { field, tags, combined, baseTags, onChange, onChangeTags, loadReference, related } = props
  // revert and remove touch the whole field, as on its own row; a mixed key has no single base value to revert to
  const mixedKeys = mixedKeysOf(field, combined)
  const present = isPresent(field, tags) || mixedKeys.length > 0
  const modified = baseTags !== undefined && isModified(field, tags, baseTags)
  const apply = (edits: TagEdit[]) => writeEdits({ onChange, onChangeTags }, edits)
  return (
    <>
      {field.reference ? (
        <InfoPopover
          label={field.label}
          reference={field.reference}
          load={loadReference}
          buttonClassName={INFO_BUTTON}
          hint={
            showsDirectionRotateHint({ key: field.key, fieldType: field.type })
              ? m.direction_rotate_hint({ key: 'R', ...device() })
              : undefined
          }
        />
      ) : null}
      {onChange && related ? <RelatedAddButtons field={field} related={related(field)} /> : null}
      {onChange && modified && baseTags && mixedKeys.length === 0 ? (
        <button
          type="button"
          aria-label={m.ui_revert_named({ label: field.label })}
          title={m.ui_revert_named({ label: field.label })}
          className={ACTION_BUTTON}
          onClick={() => apply(revertEdits(field, tags, baseTags))}
        >
          <ArrowUturnLeftIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
      {onChange && present ? (
        <button
          type="button"
          aria-label={m.ui_remove_named({ label: field.label })}
          title={m.ui_remove_named({ label: field.label })}
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
}
