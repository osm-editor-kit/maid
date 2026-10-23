import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react'
import type { Field } from '@osm-editor-kit/maid-presets'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { listRow } from '../listbox.ts'
import { isUnsetOption } from '../logic.ts'
import {
  comboArrow,
  comboChoose,
  comboDelete,
  comboEnter,
  comboEscape,
  comboList,
  comboOpen,
  comboSettle,
  comboStart,
  comboTab,
  comboType,
  type ComboKeyEnv,
  type ComboKeyState,
} from './combo-keys.ts'
import { iconSlotOf, shownText, valueFromText } from './combo-logic.ts'
import { LengthNotice, useLengthLimit } from './DraftInput.tsx'
import { IconSlot } from './IconSlot.tsx'
import type { FieldProps, IconRenderer } from './shared.ts'
import { INPUT, LIMITED } from './shared.ts'

/**
 * The input of a combobox, over one key: the options of `field`, the text it shows (`value`, undefined when
 * the key is empty or mixed) and its placeholder and title. Shared by the combo fields and the generic mixed
 * control (fields/Fallback.tsx), so a key that is mixed can offer its values as the list.
 *
 * The keys are combo-keys.ts (iD's combobox rules, as pure functions over the state). This component keeps
 * the state, applies what the functions return, and writes the text on blur. `latest` is the newest state:
 * a key that blurs the input (Enter) is followed by a blur that must read the state the key made, before React
 * has rendered it.
 */
export function ComboInput(props: {
  id?: string
  field: Field
  tagKey: string
  value: string | undefined
  /** The placeholder of the empty input. Absent: the field's own. */
  placeholder?: string
  /** The input's title (tooltip), e.g. the values of a mixed key. */
  title?: string
  onChange?: FieldProps['onChange']
  /** The input is disabled: shown with its value, not editable (a directional side that is not used). */
  disabled?: boolean
  /** The id of the element that describes the input (the reason it is disabled). */
  describedBy?: string
  /** Draws the icons of the values (FieldProps.renderIcon). Absent: no icons, no icon slots. */
  renderIcon?: IconRenderer
}) {
  const {
    id,
    field,
    tagKey,
    value,
    placeholder,
    title,
    onChange,
    disabled,
    describedBy,
    renderIcon,
  } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const options = field.options.filter((option) => !isUnsetOption(option))
  const env: ComboKeyEnv = { options, caseSensitive: field.caseSensitive === true }
  const shown = shownText(field, value)
  const [state, setState] = useState<ComboKeyState>(() => comboStart(shown.text))
  const latest = useRef<ComboKeyState>(state)
  const inputRef = useRef<HTMLInputElement>(null)

  /** Keeps the newest state for the handlers, and renders it. */
  function apply(next: ComboKeyState) {
    latest.current = next
    setState(next)
  }

  const results = comboList(env, state)
  const active = state.active < results.length ? state.active : -1
  const listVisible = onChange !== undefined && state.open && results.length > 0

  // The inline completion is selected, so that the next key replaces it (iD selects the completed part)
  useLayoutEffect(() => {
    const range = state.completion
    const input = inputRef.current
    if (!range || !input || document.activeElement !== input) return
    input.setSelectionRange(range.start, range.end)
  }, [state])

  const { refs, floatingStyles } = useFloating({
    open: listVisible,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { minWidth: `${rects.reference.width}px` })
        },
      }),
    ],
  })

  /** Writes the text as a value, as cleanValue and the spelling rules make it, and shows what was written. */
  function commit() {
    const text = latest.current.text
    if (!onChange) return
    const write = text === shown.text ? undefined : valueFromText(field, text)
    if (write === undefined || write === 'refused') {
      apply(comboSettle(latest.current, shown.text))
      return
    }
    apply(comboSettle(latest.current, shownText(field, write.value).text))
    if (write.value !== value) onChange(tagKey, write.value)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault()
        apply(comboArrow(env, latest.current, event.key === 'ArrowDown' ? 1 : -1))
        return
      case 'Tab':
        // no preventDefault: focus moves on, and the blur commits the chosen label
        apply(comboTab(env, latest.current).state)
        return
      case 'Enter':
        event.preventDefault()
        apply(comboEnter(env, latest.current).state)
        event.currentTarget.blur()
        return
      case 'Escape':
        // as DraftInput: the value comes back, and the editor does not see the key
        event.stopPropagation()
        apply(comboEscape(latest.current, shown.text))
        return
      case 'Backspace':
      case 'Delete': {
        const result = comboDelete(latest.current)
        if (result.handled) event.preventDefault()
        apply(result.state)
        return
      }
    }
  }

  /** The icon slot of an option: none without icons or without a renderer, else a slot with the value's icon or empty. */
  function optionSlot(value: string) {
    if (!renderIcon) return null
    const slot = iconSlotOf(field, value)
    return slot.slot ? <IconSlot icon={slot.icon} renderIcon={renderIcon} /> : null
  }

  const italic = shown.raw && state.text === shown.text
  // the chosen value's icon, at the left inside the input (iD's combo input): the committed value, not the draft
  const inputIcon = renderIcon ? iconSlotOf(field, value).icon : undefined
  const limit = useLengthLimit(state.text)

  return (
    <div className="grid min-w-0 gap-1">
      <div ref={refs.setReference} className="relative min-w-0">
        {renderIcon && inputIcon !== undefined ? (
          <IconSlot
            icon={inputIcon}
            renderIcon={renderIcon}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
          />
        ) : null}
        <input
          {...PLAIN_INPUT}
          ref={inputRef}
          id={id}
          type="text"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder ?? field.placeholder}
          title={title}
          readOnly={onChange === undefined}
          disabled={disabled}
          value={state.text}
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-autocomplete="both"
          aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
          className={`${INPUT} ${LIMITED} ${italic ? 'italic' : ''} ${renderIcon && inputIcon !== undefined ? 'pl-10' : ''}`}
          aria-invalid={limit.invalid}
          aria-describedby={limit.describedBy(describedBy)}
          onChange={(event) => {
            const input = event.currentTarget
            apply(
              comboType(
                env,
                latest.current,
                input.value,
                input.selectionEnd === input.value.length,
              ),
            )
          }}
          onClick={() => {
            if (onChange !== undefined) apply(comboOpen(latest.current))
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            commit()
          }}
        />
      </div>
      <LengthNotice draft={state.text} messageId={limit.messageId} />
      <FloatingPortal>
        {listVisible ? (
          <div
            id={listId}
            // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
            ref={refs.setFloating}
            role="listbox"
            aria-label={field.label}
            // keeps the focus in the input while the list is clicked
            onMouseDown={(event) => event.preventDefault()}
            style={floatingStyles}
            className="z-50 max-h-[26rem] overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          >
            {results.map((option, index) => (
              <div
                key={option.value}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => {
                  apply(comboChoose(latest.current, option.label))
                  inputRef.current?.blur()
                }}
                className={`flex h-8 cursor-pointer items-center gap-3 px-2 ${listRow({ active: index === active })}`}
              >
                {optionSlot(option.value)}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {option.label !== option.value ? (
                  <span className="shrink-0 truncate font-mono text-xs text-zinc-500 dark:text-zinc-400">
                    {option.value}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </FloatingPortal>
    </div>
  )
}
