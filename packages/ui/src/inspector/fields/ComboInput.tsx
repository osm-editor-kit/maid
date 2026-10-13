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
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { PLAIN_INPUT } from '../../plain-input.ts'
import { isUnsetOption } from '../logic.ts'
import { moveActive } from '../picker-logic.ts'
import { filterOptions, shownText, valueFromText } from './combo-logic.ts'
import { LengthNotice, useLengthLimit } from './DraftInput.tsx'
import type { FieldProps } from './shared.ts'
import { INPUT, LIMITED } from './shared.ts'

/**
 * The input of a combobox, over one key: the options of `field`, the text it shows (`value`, undefined when
 * the key is empty or mixed) and its placeholder and title. Shared by the combo fields and the generic mixed
 * control (fields/Fallback.tsx), so a key that is mixed can offer its values as the list.
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
}) {
  const { id, field, tagKey, value, placeholder, title, onChange } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const options = field.options.filter((option) => !isUnsetOption(option))
  const shown = shownText(field, value)
  const [draft, setDraft] = useState(shown.text)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // A choice made with the keyboard or the mouse: the text the next blur commits instead of the draft
  const pending = useRef<string | undefined>(undefined)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = filterOptions(options, draft)
  const active = activeIndex < results.length ? activeIndex : -1
  const listVisible = onChange !== undefined && open && results.length > 0

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

  /** Writes the text as a value, as cleanValue and the spelling rules make it. */
  function commit(text: string) {
    if (!onChange) return
    if (text === shown.text) {
      setDraft(shown.text)
      return
    }
    const write = valueFromText(field, text)
    if (write === 'refused') {
      setDraft(shown.text)
      return
    }
    setDraft(shownText(field, write.value).text)
    if (write.value !== value) onChange(tagKey, write.value)
  }

  /** Puts a label in the input; the blur that follows commits it. */
  function choose(label: string) {
    pending.current = label
    setDraft(label)
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    const picked = listVisible && active >= 0 ? results[active] : undefined
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setOpen(true)
        setActiveIndex(moveActive(listVisible ? active : -1, delta, results.length))
        return
      }
      case 'Tab':
        // no preventDefault: focus moves on, and the blur commits the chosen label
        if (picked) choose(picked.label)
        return
      case 'Enter':
        event.preventDefault()
        if (picked) choose(picked.label)
        event.currentTarget.blur()
        return
      case 'Escape':
        // as DraftInput: the value comes back, and the editor does not see the key
        event.stopPropagation()
        setOpen(false)
        setActiveIndex(-1)
        setDraft(shown.text)
        return
    }
  }

  const italic = shown.raw && draft === shown.text
  const limit = useLengthLimit(draft)

  return (
    <div className="grid min-w-0 gap-1">
      {/* oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render */}
      <div ref={refs.setReference} className="min-w-0">
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
          value={draft}
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
          className={`${INPUT} ${LIMITED} ${italic ? 'italic' : ''}`}
          aria-invalid={limit.invalid}
          aria-describedby={limit.describedBy()}
          onChange={(event) => {
            setDraft(event.currentTarget.value)
            setOpen(true)
            setActiveIndex(-1)
          }}
          onClick={() => {
            if (onChange !== undefined) setOpen(true)
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            const text = pending.current ?? draft
            pending.current = undefined
            setOpen(false)
            setActiveIndex(-1)
            commit(text)
          }}
        />
      </div>
      <LengthNotice draft={draft} messageId={limit.messageId} />
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
                  choose(option.label)
                  inputRef.current?.blur()
                }}
                className={`flex h-8 cursor-pointer items-center gap-3 rounded px-2 ${
                  index === active ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                }`}
              >
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
