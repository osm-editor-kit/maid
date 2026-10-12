import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ReferenceLoader } from '../InfoPopover.tsx'
import {
  addableFields,
  addPicked,
  defaultOnPick,
  pickedFields,
  rowFields,
} from './add-field-logic.ts'
import { AddField } from './AddField.tsx'
import { AccessField } from './fields/Access.tsx'
import { AddressField } from './fields/Address.tsx'
import { CheckField } from './fields/Check.tsx'
import { ComboField } from './fields/Combo.tsx'
import { ColourField, DateField } from './fields/DateColour.tsx'
import { DirectionalComboField } from './fields/Directional.tsx'
import { EmailField, IdentifierField, TelField, UrlField } from './fields/Link.tsx'
import { LocalizedField } from './fields/Localized.tsx'
import { ManyComboField, MultiComboField, SemiComboField } from './fields/Multi.tsx'
import { NumberField, RoadHeightField, RoadSpeedField } from './fields/Number.tsx'
import { RadioField, StructureRadioField } from './fields/Radio.tsx'
import type { RelatedRow } from './fields/Related.tsx'
import { FieldRow } from './fields/Row.tsx'
import type { FieldComponent, FieldFocus } from './fields/shared.ts'
import { TextField, TextareaField } from './fields/Text.tsx'
import { fieldKeys } from './logic.ts'
import { assignRelatedTags, relatedBaseKeys, relatedButtonKeys } from './related-logic.ts'

export { CheckField } from './fields/Check.tsx'
export { ComboField } from './fields/Combo.tsx'
export { FallbackField } from './fields/Fallback.tsx'
export { NumberField } from './fields/Number.tsx'
export { TextField, TextareaField } from './fields/Text.tsx'
export type { FieldComponent, FieldFocus, FieldProps } from './fields/shared.ts'

/** iD field type → component. Types not listed use FallbackField. */
export const defaultFieldComponents: Record<string, FieldComponent> = {
  text: TextField,
  textarea: TextareaField,
  url: UrlField,
  email: EmailField,
  tel: TelField,
  identifier: IdentifierField,
  localized: LocalizedField,
  directionalCombo: DirectionalComboField,
  date: DateField,
  colour: ColourField,
  number: NumberField,
  roadspeed: RoadSpeedField,
  roadheight: RoadHeightField,
  combo: ComboField,
  typeCombo: ComboField,
  networkCombo: ComboField,
  semiCombo: SemiComboField,
  multiCombo: MultiComboField,
  manyCombo: ManyComboField,
  radio: RadioField,
  structureRadio: StructureRadioField,
  access: AccessField,
  address: AddressField,
  check: CheckField,
  defaultCheck: CheckField,
  onewayCheck: CheckField,
}

/**
 * The preset's fields, one row each, then the picked fields, then the "Add field" input for the
 * rest of `moreFields`. Renders nothing when there is no row and nothing to add. Give it a `key` per
 * feature: the picked fields are state of this component and are forgotten with it.
 */
export function PresetFields(props: {
  fields: Field[]
  tags: Tags
  /** The tags before any edit. Given, the rows get a revert button for what differs from them. */
  baseTags?: Tags
  onChange?: (key: string, value: string | undefined) => void
  /** Overrides or adds components per field type */
  components?: Record<string, FieldComponent>
  /** The fields the "Add field" list offers (presets.moreFieldsFor). No list without onChange. */
  moreFields?: Field[]
  /** Finds the wiki documentation for each row's "i". Called only when one is opened. */
  loadReference?: ReferenceLoader
  /**
   * Told when the focus or the pointer moves onto a control of one key, with its value (the draft,
   * while it is typed), and with null when it leaves. The focus wins over the pointer. Delegated
   * from the list: a control only needs its row's data attributes (data-focus-key, data-focus-side).
   */
  onFieldFocus?: (focus: FieldFocus | null) => void
}): ReactNode {
  const {
    fields,
    tags,
    baseTags,
    onChange,
    components,
    moreFields = [],
    loadReference,
    onFieldFocus,
  } = props
  // the ids picked from "Add field", in the order picked: they are rows although they have no value
  const [picked, setPicked] = useState<string[]>([])
  // the keys of the related tags whose editor is open: state of this list, a new feature starts with none
  const [editors, setEditors] = useState<string[]>([])
  const openEditor = (key: string) =>
    setEditors((keys) => (keys.includes(key) ? keys : [...keys, key]))
  const closeEditor = (key: string) => setEditors((keys) => keys.filter((open) => open !== key))
  const containerRef = useRef<HTMLDivElement>(null)
  // the row to focus, set by a pick and taken once the row is rendered
  const focusNext = useRef<string | undefined>(undefined)
  useEffect(() => {
    const target = focusNext.current
    if (target === undefined) return
    focusNext.current = undefined
    const rows = containerRef.current?.querySelectorAll<HTMLElement>('[data-field-id]') ?? []
    const row = [...rows].find((element) => element.dataset.fieldId === target)
    row?.querySelector<HTMLElement>('input, textarea, select')?.focus()
  }, [picked])

  // what the map was last told: the focused control, else the hovered one. Set in the handlers only.
  const focusRef = useRef<FieldFocus | null>(null)
  const hoverRef = useRef<FieldFocus | null>(null)
  const shownRef = useRef<FieldFocus | null>(null)
  const report = () => {
    const next = focusRef.current ?? hoverRef.current
    if (sameFocus(shownRef.current, next)) return
    shownRef.current = next
    onFieldFocus?.(next)
  }

  // A write remounts the control that had the focus or was under the pointer, and no blur or
  // leave event tells. After every change of the tags, what is no longer focused or hovered is
  // dropped, so the map does not keep showing it.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    if (focusRef.current && !container.contains(document.activeElement)) focusRef.current = null
    if (hoverRef.current && !container.querySelector('[data-focus-key]:hover'))
      hoverRef.current = null
    const next = focusRef.current ?? hoverRef.current
    if (sameFocus(shownRef.current, next)) return
    shownRef.current = next
    onFieldFocus?.(next)
  }, [tags, onFieldFocus])

  const registry = { ...defaultFieldComponents, ...components }
  const rows = rowFields(fields, pickedFields(picked, [...fields, ...moreFields]))
  const offer = onChange ? addableFields(moreFields, new Set(rows.map((field) => field.id))) : []
  // a tag is related to a row when it is about one of the row's keys and no field of its own has that key
  const ownKeys = [...fields, ...moreFields].flatMap((field) => fieldKeys(field, tags))
  const lines = assignRelatedTags(
    rows.map((field) => ({ id: field.id, keys: relatedBaseKeys(field) })),
    tags,
    ownKeys,
  )
  const relatedOf = (field: Field): RelatedRow => ({
    lines: lines.get(field.id) ?? [],
    offers: onChange ? relatedButtonKeys(relatedBaseKeys(field), field.key, tags) : [],
    open: onChange ? editors : [],
    onOpen: openEditor,
    onClose: closeEditor,
  })

  // a field from the list is shown at once; a `default` is written when its key is empty
  const pick = (field: Field) => {
    setPicked((ids) => addPicked(ids, field.id))
    focusNext.current = field.id
    const value = defaultOnPick(field, tags)
    if (field.key !== undefined && value !== undefined) onChange?.(field.key, value)
  }

  if (rows.length === 0 && offer.length === 0) return null
  return (
    <div
      ref={containerRef}
      className="flex flex-col gap-3"
      onFocus={(event) => {
        focusRef.current = focusOf(event.target, containerRef.current, tags)
        report()
      }}
      onBlur={() => {
        focusRef.current = null
        report()
      }}
      onInput={(event) => {
        if (focusRef.current === null) return
        focusRef.current = focusOf(event.target, containerRef.current, tags)
        report()
      }}
      onPointerOver={(event) => {
        hoverRef.current = focusOf(event.target, containerRef.current, tags)
        report()
      }}
      onPointerLeave={() => {
        hoverRef.current = null
        report()
      }}
    >
      {rows.map((field) => (
        // empty: a keyless row without a value renders nothing and must not leave a gap
        <div
          key={field.id}
          data-field-id={field.id}
          // the row's own key, for the map; a directional side inside it has its own and is the innermost
          data-focus-key={field.key}
          className="empty:hidden"
        >
          <FieldRow
            field={field}
            tags={tags}
            baseTags={baseTags}
            onChange={onChange}
            registry={registry}
            related={relatedOf(field)}
            loadReference={loadReference}
          />
        </div>
      ))}
      {offer.length > 0 ? <AddField fields={offer} onPick={pick} /> : null}
    </div>
  )
}

/**
 * The control under an event's target, for the map: the innermost element with a key (its row, or
 * a directional side), its id and its value. Null outside the list and for a row without a key.
 */
function focusOf(
  target: EventTarget | null,
  container: HTMLElement | null,
  tags: Tags,
): FieldFocus | null {
  if (!(target instanceof Element) || !container?.contains(target)) return null
  const element = target.closest<HTMLElement>('[data-focus-key]')
  const key = element?.dataset.focusKey
  if (!element || !key) return null
  const row = element.closest<HTMLElement>('[data-field-id]')
  const input = element.querySelector<HTMLInputElement>('input')
  const side = element.dataset.focusSide
  return {
    fieldId: row?.dataset.fieldId ?? '',
    key,
    value: input ? input.value : tags[key],
    side: side === 'left' || side === 'right' ? side : undefined,
  }
}

function sameFocus(a: FieldFocus | null, b: FieldFocus | null): boolean {
  if (a === null || b === null) return a === b
  return a.fieldId === b.fieldId && a.key === b.key && a.side === b.side && a.value === b.value
}
