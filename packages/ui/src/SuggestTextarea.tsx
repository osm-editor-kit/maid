import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react'
import { useId, useState, type KeyboardEvent } from 'react'
import { listRow, revealRow } from './inspector/listbox.ts'
import { moveActive } from './inspector/picker-logic.ts'
import { PLAIN_INPUT } from './plain-input.ts'

/**
 * A text area with a list of suggestions under it, as iD's comment field of a changeset (a combobox over a
 * textarea). The caller says which suggestions fit the text (`suggestions`, already matched); this component shows
 * them while the area has the focus, and a choice replaces the whole text.
 *
 * Keys: Down and Up move through the list (wrapping) and are the caret's keys again when the list is closed; Enter
 * takes the highlighted suggestion (without one it is a new line); Tab takes it too, and moves on; Escape closes the
 * list and the editor does not see it (a second Escape reaches whatever holds the area, such as a flyout). A click on a
 * suggestion takes it and the focus stays in the area.
 */
export function SuggestTextarea(props: {
  id?: string
  value: string
  onChange: (text: string) => void
  onBlur?: () => void
  /** The suggestions that fit the text, in the order to show them. None: no list. */
  suggestions: readonly string[]
  /** The list's accessible name */
  label: string
  placeholder?: string
  rows?: number
  maxLength?: number
  className?: string
  describedBy?: string
}) {
  const { id, value, onChange, onBlur, suggestions, label, describedBy } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const visible = open && suggestions.length > 0
  const active = visible && activeIndex < suggestions.length ? activeIndex : -1

  const { refs, floatingStyles } = useFloating({
    open: visible,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply({ rects, elements }) {
          Object.assign(elements.floating.style, { width: `${rects.reference.width}px` })
        },
      }),
    ],
  })

  function take(index: number) {
    const text = suggestions[index]
    if (text === undefined) return
    onChange(text)
    setOpen(false)
    setActiveIndex(-1)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || !visible) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const next = moveActive(active, event.key === 'ArrowDown' ? 1 : -1, suggestions.length)
        setActiveIndex(next)
        // the row is rendered already; the list scrolls to it
        revealRow(optionId(next))
        return
      }
      case 'Enter':
        if (active < 0) return
        event.preventDefault()
        take(active)
        return
      case 'Tab':
        // no preventDefault: the focus moves on
        if (active >= 0) take(active)
        return
      case 'Escape':
        event.stopPropagation()
        setOpen(false)
        setActiveIndex(-1)
        return
    }
  }

  return (
    // oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render
    <div ref={refs.setReference} className="min-w-0">
      <textarea
        {...PLAIN_INPUT}
        id={id}
        role="combobox"
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-describedby={describedBy}
        rows={props.rows}
        maxLength={props.maxLength}
        placeholder={props.placeholder}
        className={props.className}
        value={value}
        onChange={(event) => {
          onChange(event.currentTarget.value)
          setOpen(true)
          setActiveIndex(-1)
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false)
          setActiveIndex(-1)
          onBlur?.()
        }}
      />
      <FloatingPortal>
        {visible ? (
          <div
            id={listId}
            // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
            ref={refs.setFloating}
            role="listbox"
            aria-label={label}
            // keeps the focus in the area while the list is clicked
            onMouseDown={(event) => event.preventDefault()}
            style={floatingStyles}
            className="z-50 max-h-64 overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          >
            {suggestions.map((text, index) => (
              <div
                key={text}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                title={text}
                onClick={() => take(index)}
                className={`flex min-h-8 cursor-pointer items-center px-2 py-1 ${listRow({ active: index === active })}`}
              >
                <span className="line-clamp-2 min-w-0 [overflow-wrap:anywhere]">{text}</span>
              </div>
            ))}
          </div>
        ) : null}
      </FloatingPortal>
    </div>
  )
}
