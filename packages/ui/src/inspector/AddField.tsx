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
import { useId, useState, type KeyboardEvent } from 'react'
import { searchFields } from './add-field-logic.ts'
import { HINT, INPUT } from './fields/shared.ts'
import { moveActive } from './picker-logic.ts'

/**
 * The "Add field" input: a combobox over the fields that are not rows yet. Typing filters them
 * (label, id and keys); Down and Up move through the list; Enter or a click picks the highlighted
 * field. Escape clears the text. A pick is reported through `onPick`; the parent shows the row.
 */
export function AddField(props: { fields: readonly Field[]; onPick: (field: Field) => void }) {
  const { fields, onPick } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  // the highlighted row; the first one until the user moves
  const [activeIndex, setActiveIndex] = useState(0)

  const results = searchFields(fields, query)
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1)
  const listVisible = open && results.length > 0

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

  function pick(field: Field) {
    setQuery('')
    setOpen(false)
    setActiveIndex(0)
    onPick(field)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault()
        const delta = event.key === 'ArrowDown' ? 1 : -1
        setOpen(true)
        setActiveIndex(moveActive(listVisible ? active : -1, delta, results.length))
        return
      }
      case 'Enter': {
        event.preventDefault()
        const field = listVisible && active >= 0 ? results[active] : undefined
        if (field) pick(field)
        return
      }
      case 'Escape':
        // as the combos: the editor does not see the key
        event.stopPropagation()
        setQuery('')
        setOpen(false)
        setActiveIndex(0)
        return
    }
  }

  return (
    <div className="grid min-w-0 gap-1">
      {/* oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render */}
      <div ref={refs.setReference} className="min-w-0">
        <input
          type="text"
          role="combobox"
          aria-label="Add field"
          autoComplete="off"
          spellCheck={false}
          placeholder="Add field"
          value={query}
          aria-expanded={listVisible}
          aria-controls={listVisible ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listVisible && active >= 0 ? optionId(active) : undefined}
          className={INPUT}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setOpen(true)
            setActiveIndex(0)
          }}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            setQuery('')
            setOpen(false)
            setActiveIndex(0)
          }}
        />
      </div>
      <FloatingPortal>
        {listVisible ? (
          <div
            id={listId}
            // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
            ref={refs.setFloating}
            role="listbox"
            aria-label="Fields to add"
            // keeps the focus in the input while the list is clicked
            onMouseDown={(event) => event.preventDefault()}
            style={floatingStyles}
            className="z-50 max-h-[26rem] overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
          >
            {results.map((field, index) => (
              <div
                key={field.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => pick(field)}
                className={`flex h-8 cursor-pointer items-center gap-3 rounded px-2 ${
                  index === active ? 'bg-zinc-950/5 dark:bg-white/10' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{field.label}</span>
                {field.universal ? <span className={`${HINT} shrink-0`}>general</span> : null}
              </div>
            ))}
          </div>
        ) : null}
      </FloatingPortal>
    </div>
  )
}
