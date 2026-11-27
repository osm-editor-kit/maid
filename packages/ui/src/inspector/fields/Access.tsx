import { PlusIcon } from '@heroicons/react/16/solid'
import { m } from '@osm-editor-kit/maid-i18n'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useEffect, useId, useState, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip } from '../../Tooltip.tsx'
import { accessKeyLabel, accessRowKeys, addableAccessKeys } from './access-logic.ts'
import { ComboField } from './Combo.tsx'
import { ComboInput } from './ComboInput.tsx'
import { multipleValues, mixedKeysOf, mixedOf } from './mixed-logic.ts'
import { accessOptions, accessPlaceholder, accessValueLabel } from './radio-logic.ts'
import type { CombinedTags, FieldProps } from './shared.ts'
import { LABEL, ROW_BUTTON } from './shared.ts'

/**
 * Access: one compact combo per key, as iD's access field, with the additions of Tobias's iD pull request
 * openstreetmap/iD#12011:
 * - the rows are the field's own keys (access, foot, motor_vehicle, bicycle, horse) and every other access key
 *   that is set (mofa, bus, vehicle, …; ACCESS_KEYS), in the wiki's order (accessRowKeys);
 * - "+" in the label bar opens a row under the title that picks a further key (another mode of transport); the
 *   new row is shown empty and takes the focus, and is written once it gets a value;
 * - values and placeholders show as the option's label ("Allowed", "Private", "Use sidepath"), a value with no
 *   option as it is, in italics.
 * Each row writes its own key on commit (the combo's blur) and removes it when empty. Read-only without onChange.
 * Several features: the placeholder is the implied value when every feature implies the same one, else
 * "Multiple values" (accessPlaceholder); a mixed key is an empty combo with its values as the title.
 *
 * Row.tsx keeps this control mounted while the tags change (STEADY_TYPES), so the added rows stay; each row
 * starts over when its own value changes.
 */
export function AccessField(props: FieldProps) {
  const { field, tags, onChange, combined, features, labelActions } = props
  // keys added with "+" that have no value yet; a key stays here after it got one (its row stays either way)
  const [added, setAdded] = useState<string[]>([])
  const [picking, setPicking] = useState(false)
  // the row that takes the focus once it is drawn: the key just added
  const [focusKey, setFocusKey] = useState<string>()
  const setKeys = Object.keys(tags).filter((key) => (tags[key] ?? '') !== '')
  const rows = accessRowKeys(field.keys ?? [], [
    ...setKeys,
    ...mixedKeysOf(field, combined),
    ...added,
  ])
  const addable = addableAccessKeys(rows)

  function addKey(key: string) {
    setAdded((keys) => (keys.includes(key) ? keys : [...keys, key]))
    setFocusKey(key)
    setPicking(false)
  }

  return (
    // two columns once the sidebar is wide enough for two label-and-input rows side by side (a container query
    // reads the wrapper, not the grid itself)
    <div className="@container grid min-w-0 gap-1.5">
      {picking && onChange ? (
        <KeyPicker keys={addable} onPick={addKey} onClose={() => setPicking(false)} />
      ) : null}
      <div className="grid min-w-0 gap-1.5 @[30rem]:grid-cols-2 @[30rem]:gap-x-4">
        {rows.map((key) => (
          <AccessRow
            // the row's draft starts over when its value changes elsewhere, or when it becomes mixed
            key={`${key}=${tags[key] ?? ''}|${JSON.stringify(mixedOf(combined, key) ?? null)}`}
            rowKey={key}
            tags={tags}
            combined={combined}
            features={features}
            onChange={onChange}
            focus={key === focusKey}
            onFocused={() => setFocusKey(undefined)}
          />
        ))}
      </div>
      {onChange && labelActions && addable.length > 0
        ? createPortal(
            <Tooltip label={m.ui_access_add()}>
              <button
                type="button"
                aria-label={m.ui_access_add()}
                aria-expanded={picking}
                // a click while the row is open first blurs it (which closes it), then opens it again
                onClick={() => setPicking(true)}
                className={ROW_BUTTON}
              >
                <PlusIcon aria-hidden="true" className="size-4" />
              </button>
            </Tooltip>,
            labelActions,
          )
        : null}
    </div>
  )
}

/**
 * The row under the title that picks the key to add: a combo of the keys not shown yet, by their labels. It
 * takes the focus when it opens; choosing a key adds its row, leaving it (or Escape) closes it.
 */
function KeyPicker(props: {
  keys: readonly string[]
  onPick: (key: string) => void
  onClose: () => void
}) {
  const { keys, onPick, onClose } = props
  const id = useId()
  const pickerField: Field = {
    id: 'access-add-key',
    type: 'combo',
    label: m.ui_access_add(),
    options: keys.map((key) => ({ value: key, label: accessKeyLabel(key) })),
    universal: false,
    customValues: false,
  }

  useEffect(() => {
    const input = document.getElementById(id)
    input?.focus()
    input?.click()
  }, [id])

  // Escape closes the row; the combo's own Escape stops the event, so it is read on the way down
  function onKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') onClose()
  }

  return (
    <div onBlur={onClose} onKeyDownCapture={onKeyDownCapture} className="min-w-0">
      <ComboInput
        id={id}
        field={pickerField}
        tagKey="access-add-key"
        value={undefined}
        placeholder={m.ui_access_add()}
        onChange={(_tagKey, value) => {
          if (value !== undefined) onPick(value)
        }}
      />
    </div>
  )
}

function AccessRow(props: {
  rowKey: string
  tags: Tags
  combined: CombinedTags | undefined
  features: readonly Tags[] | undefined
  onChange: FieldProps['onChange']
  /** The row was just added: its input takes the focus once. */
  focus: boolean
  onFocused: () => void
}) {
  const { rowKey, tags, combined, features, onChange, focus, onFocused } = props
  const id = useId()
  const label = accessKeyLabel(rowKey)

  useEffect(() => {
    if (!focus) return
    const input = document.getElementById(id)
    input?.focus()
    input?.click()
    onFocused()
  }, [focus, id, onFocused])

  // Without the features a mixed key has no implied value that can be shown: the placeholder says so
  const implied =
    mixedOf(combined, rowKey) !== undefined && features === undefined
      ? multipleValues()
      : accessPlaceholder(rowKey, tags, features)
  // the implied value as its option's label ("Allowed"), as the input shows a value
  const placeholder =
    implied === undefined || implied === multipleValues()
      ? (implied ?? '')
      : accessValueLabel(rowKey, implied)
  // A synthetic combo field: the row's key and its options. Other values can be typed (as iD's access field).
  const rowField: Field = {
    id: `access-${rowKey}`,
    type: 'combo',
    key: rowKey,
    label,
    options: accessOptions(rowKey),
    universal: false,
  }
  return (
    <div className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-2">
      <label htmlFor={id} className={LABEL} title={rowKey}>
        {label}
      </label>
      <ComboField
        field={rowField}
        tags={tags}
        combined={combined}
        placeholder={placeholder}
        id={id}
        onChange={onChange}
      />
    </div>
  )
}
