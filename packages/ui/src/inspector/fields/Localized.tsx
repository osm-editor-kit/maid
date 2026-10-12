import { LanguageIcon, TrashIcon } from '@heroicons/react/16/solid'
import type { Field, Tags } from '@osm-editor-kit/maid-presets'
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Tooltip } from '../../Tooltip.tsx'
import { DraftInput, LengthNotice } from './DraftInput.tsx'
import { FallbackField } from './Fallback.tsx'
import { commitLanguageRow, languageVariants, type LanguageVariant } from './localized-logic.ts'
import type { FieldProps } from './shared.ts'
import { INPUT, ROW_BUTTON } from './shared.ts'

/**
 * A localized name: the base input on the field's key (as TextField), then one row per translation
 * `<key>:<code>` (languageVariants). "Add a language" is an icon in the row's label bar
 * (labelActions, set by Row.tsx) and adds a new row. A row is a language code and a value; both
 * are committed when focus leaves the row (commitLanguageRow), so Tab moves between them without
 * a write. Read-only without onChange: no buttons, inputs read-only.
 *
 * Row.tsx keys the control by its key's value; the type is listed in STEADY_TYPES so that the rows
 * being typed in keep their state while the tags change.
 */
export function LocalizedField(props: FieldProps) {
  if (props.field.key === undefined) return <FallbackField {...props} />
  return <LocalizedControl {...props} />
}

function LocalizedControl(props: FieldProps) {
  const { field, tags, id, onChange, labelActions } = props
  const key = field.key ?? ''
  const base = tags[key] ?? ''
  const variants = languageVariants(field, tags)
  // Rows being added, newest first. Each has a number that is never reused.
  const [added, setAdded] = useState<number[]>([])
  const lastRow = useRef(0)

  function addRow() {
    lastRow.current += 1
    const row = lastRow.current
    setAdded((rows) => [row, ...rows])
  }

  return (
    <div className="grid min-w-0 gap-1.5">
      <DraftInput
        // the draft starts over when the base value changes elsewhere
        key={base}
        id={id}
        tagKey={key}
        value={base}
        placeholder={field.placeholder ?? 'Unknown'}
        onChange={onChange}
      />
      {added.map((row) => (
        <LanguageRow
          key={`new-${row}`}
          field={field}
          tags={tags}
          onChange={onChange}
          isNew
          onSettled={() => setAdded((rows) => rows.filter((item) => item !== row))}
        />
      ))}
      {variants.map((variant) => (
        <LanguageRow
          // a row starts over when its value changes elsewhere, or when its code (the key) does
          key={`${variant.tagKey}=${variant.value}`}
          field={field}
          tags={tags}
          onChange={onChange}
          variant={variant}
        />
      ))}
      {onChange && labelActions
        ? createPortal(
            <Tooltip label="Add a language">
              <button
                type="button"
                aria-label={`Add a translation of ${field.label}`}
                onClick={addRow}
                className={ROW_BUTTON}
              >
                <LanguageIcon aria-hidden="true" className="size-4" />
              </button>
            </Tooltip>,
            labelActions,
          )
        : null}
    </div>
  )
}

/**
 * One translation: the language code, the value and a cross to remove it. A row being added
 * (isNew) has no tag yet; it is written when it has a code and a value, and dropped when it is left
 * empty. A translation's code can be changed: the tag is renamed. Escape puts the row back.
 */
function LanguageRow(props: {
  field: Field
  tags: Tags
  onChange: FieldProps['onChange']
  variant?: LanguageVariant
  isNew?: boolean
  /** The row has been written or dropped: the parent removes a row being added. */
  onSettled?: () => void
}) {
  const { field, tags, onChange, variant, isNew = false, onSettled } = props
  const base = field.key ?? ''
  const editable = onChange !== undefined
  const codeInput = useRef<HTMLInputElement>(null)
  const [code, setCode] = useState(variant?.code ?? '')
  const [text, setText] = useState(variant?.value ?? '')
  const [message, setMessage] = useState<string>()

  // A row being added takes the focus: the user is about to type its code.
  useEffect(() => {
    if (isNew) codeInput.current?.focus()
  }, [isNew])

  /** Writes the row as it is typed, or says why it cannot be written. */
  function settle() {
    if (!onChange) return
    const commit = commitLanguageRow({ base, tags, tagKey: variant?.tagKey, code, value: text })
    if (commit.kind === 'error') {
      setMessage(commit.message)
      return
    }
    setMessage(undefined)
    if (commit.kind === 'discard') {
      onSettled?.()
      return
    }
    if (commit.kind === 'write') {
      for (const edit of commit.edits) onChange(edit.key, edit.value)
      if (variant === undefined && commit.edits.length > 0) onSettled?.()
    }
  }

  // Focus that moves between the row's own inputs is not the end of the row
  function onBlur(event: FocusEvent<HTMLDivElement>) {
    const next = event.relatedTarget
    if (next instanceof Node && event.currentTarget.contains(next)) return
    settle()
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      event.stopPropagation()
      if (variant) {
        setCode(variant.code)
        setText(variant.value)
        setMessage(undefined)
      } else {
        onSettled?.()
      }
    }
  }

  return (
    <div
      onBlur={onBlur}
      className={`grid min-w-0 items-start gap-2 ${
        editable ? 'grid-cols-[4.5rem_minmax(0,1fr)_1.25rem]' : 'grid-cols-[4.5rem_minmax(0,1fr)]'
      }`}
    >
      <input
        ref={codeInput}
        type="text"
        aria-label="Language code"
        aria-invalid={message === undefined ? undefined : true}
        autoComplete="off"
        spellCheck={false}
        placeholder="de"
        value={code}
        readOnly={!editable}
        onChange={(event) => {
          setCode(event.currentTarget.value)
          setMessage(undefined)
        }}
        onKeyDown={onKeyDown}
        className={`${INPUT} font-mono`}
      />
      <div className="grid min-w-0 gap-1">
        <input
          type="text"
          aria-label={`Translation of ${field.label}`}
          value={text}
          readOnly={!editable}
          onChange={(event) => {
            setText(event.currentTarget.value)
            setMessage(undefined)
          }}
          onKeyDown={onKeyDown}
          className={INPUT}
        />
        <LengthNotice draft={text} />
        {message === undefined ? null : (
          <span aria-live="polite" className="text-xs text-amber-600 dark:text-amber-400">
            {message}
          </span>
        )}
      </div>
      {editable ? (
        <button
          type="button"
          aria-label={
            variant
              ? `Remove the ${field.label} in ${variant.code}`
              : `Remove the new ${field.label}`
          }
          title={variant ? `Remove ${variant.tagKey}` : 'Remove this row'}
          className={ROW_BUTTON}
          onClick={() => {
            if (variant) onChange?.(variant.tagKey, undefined)
            else onSettled?.()
          }}
        >
          <TrashIcon aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
