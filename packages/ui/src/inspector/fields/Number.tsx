import { MinusIcon, PlusIcon } from '@heroicons/react/16/solid'
import type { Field } from '@osm-editor-kit/maid-presets'
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { cleanValue } from '../logic.ts'
import { FallbackField } from './Fallback.tsx'
import { keyDisplay } from './mixed-logic.ts'
import {
  canStep,
  formatHeight,
  formatSpeed,
  HEIGHT_UNITS,
  isDirectionKey,
  normalizeNumber,
  parseHeight,
  parseSpeed,
  SPEED_UNITS,
  stepValue,
  type HeightUnit,
  type SpeedUnit,
  type StepDirection,
} from './number-logic.ts'
import type { FieldProps } from './shared.ts'
import { FRAME, INPUT } from './shared.ts'

const STEPPER =
  'grid h-8 w-8 touch:h-11 touch:w-11 shrink-0 place-items-center border border-l-0 border-zinc-950/10 bg-white text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:relative focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-40 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'

/**
 * The part of a control that had focus when a write remounted it. Set just before the write.
 * A function, not a plain read of a module variable: the React Compiler treats such a variable
 * as constant and would read it again after it was cleared.
 */
let refocus: { id: string; part: string } | undefined
function takeRefocus(id: string) {
  if (refocus?.id !== id) return undefined
  const { part } = refocus
  refocus = undefined
  return part
}

type Parts = { current: Map<string, HTMLElement> }

/**
 * Row keys each control by its tag value, so every write remounts the control and would drop the
 * focus. A write from one part sets `refocus`; the control that mounts next focuses that part again.
 */
function useParts(id: string) {
  const parts = useRef(new Map<string, HTMLElement>())
  useEffect(() => {
    const part = takeRefocus(id)
    if (part !== undefined) parts.current.get(part)?.focus()
  }, [id])
  return parts
}

function registerPart(parts: Parts, name: string) {
  return (element: HTMLElement | null) => {
    if (element) parts.current.set(name, element)
    else parts.current.delete(name)
  }
}

type Control = {
  id: string
  tagKey: string
  /** The tag's value; a write that does not change it is skipped */
  value: string
  onChange: FieldProps['onChange']
}

/** Writes the tag when the text changes it. A part given makes that part keep the focus. */
function writeTag(control: Control, next: string | undefined, part?: string) {
  if (!control.onChange || (next ?? '') === control.value) return
  if (part !== undefined) refocus = { id: control.id, part }
  control.onChange(control.tagKey, next)
}

/** Whether a blur leaves the control: a move to another part of it keeps the draft. */
function leavesControl(event: FocusEvent<HTMLDivElement>) {
  const next = event.relatedTarget
  return !(next instanceof Node && event.currentTarget.contains(next))
}

/** Enter applies the draft, as blurring does; Escape puts the tag's value back. */
function editKey(revert: () => void) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      revert()
      event.stopPropagation()
    }
  }
}

/** A stepper keeps the focus where it is; a click would otherwise blur the input first. */
function keepFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault()
}

/**
 * A number as text, so that values with units or `;` lists are kept. Two steppers step each
 * `;`-separated value by `increment`; direction fields wrap at 360 and accept compass words.
 * Values are clamped to `minValue` and written with a dot. Empty means no tag.
 */
export function NumberField(props: FieldProps) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder)
  return (
    <NumberControl
      field={field}
      id={id ?? key}
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      mixed={shown.mixed !== undefined}
      onChange={onChange}
    />
  )
}

/**
 * A number over one key. Several features: a mixed key is an empty input with "Multiple values" and its
 * values as the title, and the steppers do nothing (iD input.js 139-142).
 */
function NumberControl({
  field,
  id,
  tagKey,
  value,
  placeholder,
  title,
  mixed,
  onChange,
}: {
  field: Field
  id: string
  tagKey: string
  value: string
  placeholder: string | undefined
  title: string | undefined
  mixed: boolean
  onChange: FieldProps['onChange']
}) {
  const parts = useParts(id)
  const [draft, setDraft] = useState(value)
  const readOnly = onChange === undefined
  const wrap = isDirectionKey(tagKey)
  const control: Control = { id, tagKey, value, onChange }

  const commit = () => {
    if (readOnly) return
    const next = normalizeNumber(cleanValue(draft) ?? '', field.minValue)
    setDraft(next)
    writeTag(control, next === '' ? undefined : next)
  }
  const step = (direction: StepDirection, part: string) => {
    if (readOnly || mixed) return
    const next = stepValue(draft, direction, {
      increment: field.increment,
      minValue: field.minValue,
      wrap,
    })
    setDraft(next)
    writeTag(control, next, part)
  }
  const stepDisabled = mixed || !canStep(draft, wrap)
  const edit = editKey(() => setDraft(value))

  return (
    <div
      className="flex min-w-0 items-stretch"
      onBlur={(event) => {
        if (leavesControl(event)) commit()
      }}
    >
      <div className="min-w-0 flex-1">
        <input
          {...PLAIN_INPUT}
          ref={registerPart(parts, 'input')}
          id={id}
          type="text"
          inputMode="decimal"
          className={readOnly ? INPUT : `${INPUT} rounded-r-none`}
          value={draft}
          placeholder={placeholder}
          title={title}
          readOnly={readOnly}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              if (readOnly || mixed) return
              event.preventDefault()
              step(event.key === 'ArrowUp' ? 1 : -1, 'input')
              return
            }
            edit(event)
          }}
        />
      </div>
      {readOnly ? null : (
        <>
          <button
            ref={registerPart(parts, 'minus')}
            type="button"
            aria-label={`Decrease ${field.label}`}
            title={`Decrease ${field.label}`}
            disabled={stepDisabled}
            onMouseDown={keepFocus}
            onClick={() => step(-1, 'minus')}
            className={`${STEPPER} rounded-none`}
          >
            <MinusIcon aria-hidden="true" className="size-4" />
          </button>
          <button
            ref={registerPart(parts, 'plus')}
            type="button"
            aria-label={`Increase ${field.label}`}
            title={`Increase ${field.label}`}
            disabled={stepDisabled}
            onMouseDown={keepFocus}
            onClick={() => step(1, 'plus')}
            className={`${STEPPER} rounded-r-md`}
          >
            <PlusIcon aria-hidden="true" className="size-4" />
          </button>
        </>
      )}
    </div>
  )
}

/**
 * A maximum speed: a number and a unit, km/h or mph. A value in mph is `<n> mph`, one in km/h a
 * plain number. `defaultUnit` shows a value without one; iD takes it from the feature's country
 * (countryCoder.roadSpeedUnit, roadspeed.js:57), which Maid does not look up yet, so the caller
 * passes it. Default km/h.
 */
export function RoadSpeedField({
  defaultUnit = 'km/h',
  ...props
}: FieldProps & { defaultUnit?: SpeedUnit }) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder)
  return (
    <SpeedControl
      field={field}
      id={id ?? key}
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      defaultUnit={defaultUnit}
      onChange={onChange}
    />
  )
}

function SpeedControl({
  field,
  id,
  tagKey,
  value,
  placeholder,
  title,
  defaultUnit,
  onChange,
}: {
  field: Field
  id: string
  tagKey: string
  value: string
  placeholder: string | undefined
  title: string | undefined
  defaultUnit: SpeedUnit
  onChange: FieldProps['onChange']
}) {
  const parts = useParts(id)
  const parsed = parseSpeed(value)
  const [number, setNumber] = useState(parsed.number)
  const [chosen, setChosen] = useState<SpeedUnit>()
  const readOnly = onChange === undefined
  const unit = chosen ?? (value.trim() === '' ? defaultUnit : parsed.unit)
  const control: Control = { id, tagKey, value, onChange }

  const commit = () => {
    if (readOnly) return
    const text = normalizeNumber(cleanValue(number) ?? '')
    setNumber(text)
    writeTag(control, formatSpeed(text, unit))
  }
  const changeUnit = (next: SpeedUnit) => {
    setChosen(next)
    writeTag(control, formatSpeed(number, next), 'unit')
  }
  const edit = editKey(() => setNumber(parsed.number))

  return (
    // the unit joins the input as the steppers of a number do
    <div
      className="flex min-w-0 items-center"
      onBlur={(event) => {
        if (leavesControl(event)) commit()
      }}
    >
      <div className="min-w-0 flex-1">
        <input
          {...PLAIN_INPUT}
          ref={registerPart(parts, 'input')}
          id={id}
          type="text"
          inputMode="decimal"
          className={`${INPUT} rounded-r-none`}
          value={number}
          placeholder={placeholder}
          title={title}
          readOnly={readOnly}
          onChange={(event) => setNumber(event.target.value)}
          onKeyDown={edit}
        />
      </div>
      <div className="w-20 shrink-0">
        <select
          ref={registerPart(parts, 'unit')}
          aria-label={`${field.label} unit`}
          className={`${FRAME} rounded-l-none border-l-0 px-2`}
          value={unit}
          disabled={readOnly}
          onChange={(event) => {
            const next = SPEED_UNITS.find((candidate) => candidate === event.target.value)
            if (next !== undefined) changeUnit(next)
          }}
        >
          {SPEED_UNITS.map((speedUnit) => (
            <option key={speedUnit} value={speedUnit}>
              {speedUnit}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}

/**
 * A height: metres, or feet and inches. Metres are a plain number, feet and inches `5'6"`. The unit
 * of a value without one is `defaultUnit` (iD: countryCoder.roadHeightUnit, roadheight.js:64; not
 * looked up in Maid yet, so the caller passes it). Default metres.
 */
export function RoadHeightField({
  defaultUnit = 'm',
  ...props
}: FieldProps & { defaultUnit?: HeightUnit }) {
  const { field, tags, id, onChange, combined } = props
  const key = field.key
  if (key === undefined) return <FallbackField {...props} />
  const shown = keyDisplay(key, tags, combined, field.placeholder)
  return (
    <HeightControl
      field={field}
      id={id ?? key}
      tagKey={key}
      value={shown.value}
      placeholder={shown.placeholder}
      title={shown.title}
      defaultUnit={defaultUnit}
      onChange={onChange}
    />
  )
}

function HeightControl({
  field,
  id,
  tagKey,
  value,
  placeholder,
  title,
  defaultUnit,
  onChange,
}: {
  field: Field
  id: string
  tagKey: string
  value: string
  placeholder: string | undefined
  title: string | undefined
  defaultUnit: HeightUnit
  onChange: FieldProps['onChange']
}) {
  const parts = useParts(id)
  const parsed = parseHeight(value)
  const [primary, setPrimary] = useState(parsed.primary)
  const [secondary, setSecondary] = useState(parsed.secondary)
  const [chosen, setChosen] = useState<HeightUnit>()
  const readOnly = onChange === undefined
  const unit = chosen ?? (value.trim() === '' ? defaultUnit : parsed.unit)
  const control: Control = { id, tagKey, value, onChange }

  const commit = () => {
    if (readOnly) return
    const first = cleanValue(primary) ?? ''
    const second = cleanValue(secondary) ?? ''
    setPrimary(normalizeNumber(first))
    setSecondary(normalizeNumber(second))
    writeTag(control, formatHeight(first, second, unit))
  }
  const changeUnit = (next: HeightUnit) => {
    setChosen(next)
    writeTag(
      control,
      formatHeight(cleanValue(primary) ?? '', cleanValue(secondary) ?? '', next),
      'unit',
    )
  }
  const revert = () => {
    setPrimary(parsed.primary)
    setSecondary(parsed.secondary)
  }
  const edit = editKey(revert)

  return (
    <div
      className="flex min-w-0 items-center gap-1"
      onBlur={(event) => {
        if (leavesControl(event)) commit()
      }}
    >
      <div className="min-w-0 flex-1">
        <input
          {...PLAIN_INPUT}
          ref={registerPart(parts, 'input')}
          id={id}
          type="text"
          inputMode="decimal"
          className={INPUT}
          value={primary}
          placeholder={placeholder}
          title={title}
          readOnly={readOnly}
          onChange={(event) => setPrimary(event.target.value)}
          onKeyDown={edit}
        />
      </div>
      {unit === 'ft' ? (
        <div className="w-16 shrink-0">
          <input
            {...PLAIN_INPUT}
            ref={registerPart(parts, 'secondary')}
            type="text"
            inputMode="decimal"
            aria-label={`${field.label}, inches`}
            placeholder="in"
            className={INPUT}
            value={secondary}
            readOnly={readOnly}
            onChange={(event) => setSecondary(event.target.value)}
            onKeyDown={edit}
          />
        </div>
      ) : null}
      <div className="w-20 shrink-0">
        <select
          ref={registerPart(parts, 'unit')}
          aria-label={`${field.label} unit`}
          className={`${FRAME} px-2`}
          value={unit}
          disabled={readOnly}
          onChange={(event) => {
            const next = HEIGHT_UNITS.find((candidate) => candidate === event.target.value)
            if (next !== undefined) changeUnit(next)
          }}
        >
          {HEIGHT_UNITS.map((heightUnit) => (
            <option key={heightUnit} value={heightUnit}>
              {heightUnit}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
