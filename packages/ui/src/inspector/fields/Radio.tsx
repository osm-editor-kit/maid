import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { toolButtonTone } from '../../Toolbar.tsx'
import type { TagEdit } from '../logic.ts'
import { ComboField } from './Combo.tsx'
import { NumberField } from './Number.tsx'
import {
  radioChoices,
  radioChosen,
  radioPick,
  radioWrite,
  structureTypeEdits,
  type RadioChoice,
} from './radio-logic.ts'
import type { FieldProps } from './shared.ts'
import { HINT, LABEL } from './shared.ts'

/**
 * Where the focus goes after an arrow key. A write remounts the row's control (Row keys it by its
 * values), so the control that mounts next focuses this button. Set before the write, taken in an
 * effect. Functions, not reads of a module variable: the React Compiler treats a module variable
 * as constant, and it would not see these writes.
 */
const pendingFocus: { field?: string; value?: string } = {}
function rememberFocus(field: string, value: string) {
  pendingFocus.field = field
  pendingFocus.value = value
}
function takeFocus(field: string): string | undefined {
  if (pendingFocus.field !== field) return undefined
  const { value } = pendingFocus
  pendingFocus.field = undefined
  pendingFocus.value = undefined
  return value
}

/** The step of each arrow key: Right and Down go on, Left and Up go back. */
const ARROW_STEPS = new Map([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
])

const BUTTON =
  'relative inline-flex h-8 min-w-0 max-w-full items-center rounded-md px-3 text-sm inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60 dark:inset-ring-white/10'

/** Focuses the button of `value` in the group, if there is one. */
function focusButton(group: HTMLElement | null, value: string): void {
  const buttons = group?.querySelectorAll<HTMLElement>('[role="radio"]') ?? []
  for (const button of buttons) {
    if (button.dataset.value === value) {
      button.focus()
      return
    }
  }
}

/**
 * The buttons of a radio, as a radiogroup. One is the tab stop (the chosen one, else the first).
 * Left, Right, Up and Down move to the next or previous button and choose it (as FilterPanel's
 * StateSwitch). A click on the chosen one calls onClick, which clears it. Without the callbacks
 * the buttons are disabled and the chosen one still shows.
 */
function RadioGroup(props: {
  field: Field
  choices: RadioChoice[]
  chosen?: string
  /** A click: choosing the chosen one clears it (radioPick). */
  onClick?: (value: string) => void
  /** An arrow key: choose this value (radioWrite). */
  onSelect?: (value: string) => void
}) {
  const { field, choices, chosen, onClick, onSelect } = props
  const group = useRef<HTMLDivElement>(null)
  const tabStop = choices.some((choice) => choice.value === chosen) ? chosen : choices[0]?.value

  useEffect(() => {
    const value = takeFocus(field.id)
    if (value !== undefined) focusButton(group.current, value)
  }, [field.id])

  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!onSelect) return
    if (!ARROW_STEPS.has(event.key)) return
    const step = ARROW_STEPS.get(event.key) ?? 1
    event.preventDefault()
    const next = choices[(index + step + choices.length) % choices.length]
    if (!next) return
    rememberFocus(field.id, next.value)
    focusButton(group.current, next.value)
    onSelect(next.value)
  }

  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={field.label}
      className="flex min-w-0 flex-wrap items-center gap-1"
    >
      {choices.map((choice, index) => {
        const checked = choice.value === chosen
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            data-value={choice.value}
            aria-checked={checked}
            tabIndex={choice.value === tabStop ? 0 : -1}
            disabled={!onClick}
            title={choice.raw ? choice.value : undefined}
            onClick={() => onClick?.(choice.value)}
            onKeyDown={(event) => move(event, index)}
            className={`${BUTTON} ${toolButtonTone(checked ? 'selected' : 'idle')}`}
          >
            <span className={choice.raw ? 'truncate italic' : 'truncate'}>
              {choice.raw ? `"${choice.label}"` : choice.label}
            </span>
          </button>
        )
      })}
      {chosen === undefined ? <span className={HINT}>None</span> : null}
    </div>
  )
}

/** Applies the edits, one onChange call per changed key. */
function applyEdits(onChange: FieldProps['onChange'], edits: TagEdit[]) {
  for (const edit of edits) onChange?.(edit.key, edit.value)
}

/**
 * A radio (iD's radio): one toggle button per option, one chosen or none. Choosing the chosen one
 * clears it. A value that is no option shows as an extra chosen button, quoted and in italics.
 * There is no free text. Writes are radioWrite / radioPick (radio-logic.ts).
 */
export function RadioField(props: FieldProps) {
  const { field, tags, onChange } = props
  return (
    <RadioGroup
      field={field}
      choices={radioChoices(field, tags)}
      chosen={radioChosen(field, tags)}
      onClick={
        onChange ? (value) => applyEdits(onChange, radioPick(field, tags, value)) : undefined
      }
      onSelect={
        onChange ? (value) => applyEdits(onChange, radioWrite(field, tags, value)) : undefined
      }
    />
  )
}

const LAYER_FIELD: Field = {
  id: 'layer',
  type: 'number',
  key: 'layer',
  label: 'Layer',
  placeholder: '0',
  options: [],
  universal: false,
}

function withoutKey(tags: Tags, key: string): Tags {
  return Object.fromEntries(Object.entries(tags).filter(([tagKey]) => tagKey !== key))
}

/**
 * The structure radio (bridge, tunnel, embankment, cutting, ford): a radio over its keys. When a
 * bridge or a tunnel is chosen it also shows its type (a combo over the key's own values, given as
 * `typeField`; the type is the value of the structure's key, and yes means no type) and its layer
 * (a number; the default is set and removed as radio-logic.ts describes). Other structures show no
 * sub-field.
 */
export function StructureRadioField(props: FieldProps & { typeField?: Field }) {
  const { field, tags, onChange, typeField } = props
  const layerId = useId()
  const chosen = radioChosen(field, tags)
  const hasSubFields = chosen === 'bridge' || chosen === 'tunnel'
  // The type combo shows no type for yes, which is what the structure's key holds without one
  const typeTags = chosen !== undefined && tags[chosen] === 'yes' ? withoutKey(tags, chosen) : tags

  return (
    <div className="grid min-w-0 gap-2">
      <RadioGroup
        field={field}
        choices={radioChoices(field, tags)}
        chosen={chosen}
        onClick={
          onChange ? (value) => applyEdits(onChange, radioPick(field, tags, value)) : undefined
        }
        onSelect={
          onChange ? (value) => applyEdits(onChange, radioWrite(field, tags, value)) : undefined
        }
      />
      {hasSubFields && chosen !== undefined && typeField !== undefined ? (
        <div className="grid min-w-0 gap-1">
          <span className={LABEL}>{typeField.label}</span>
          <ComboField
            field={{ ...typeField, key: chosen }}
            tags={typeTags}
            onChange={
              onChange
                ? (_key, value) => applyEdits(onChange, structureTypeEdits(chosen, tags, value))
                : undefined
            }
          />
        </div>
      ) : null}
      {hasSubFields ? (
        <div className="grid min-w-0 gap-1">
          <label htmlFor={layerId} className={LABEL}>
            {LAYER_FIELD.label}
          </label>
          <NumberField field={LAYER_FIELD} tags={tags} id={layerId} onChange={onChange} />
        </div>
      ) : null}
    </div>
  )
}
