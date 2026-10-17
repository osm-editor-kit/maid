import { PlusIcon } from '@heroicons/react/16/solid'
import type { Field } from '@osm-editor-kit/maid-presets'
import { useId, useState, type KeyboardEvent } from 'react'
import { twMerge } from 'tailwind-merge'
import { Flyout } from '../Flyout.tsx'
import { PLAIN_INPUT } from '../plain-input.ts'
import { toolButtonClass } from '../Toolbar.tsx'
import { rowKey, searchFields, sharedLabelIds } from './add-field-logic.ts'
import { HINT } from './fields/shared.ts'
import { EMPTY_NOTE, keepFocus, listboxMove, listRow, revealRow } from './listbox.ts'
import { SearchField } from './SearchField.tsx'

/**
 * The "Add field" button: it opens a flyout with a search field over the fields that are not rows
 * yet. The search field has the focus when the flyout opens. Typing filters the fields (label, id
 * and keys). Up and Down move the highlighted row, Enter or a click picks it, Escape closes the
 * flyout and gives the focus back to the button. A pick is reported through `onPick`; the parent
 * shows the row and gives it the focus.
 */
export function AddField(props: { fields: readonly Field[]; onPick: (field: Field) => void }) {
  const { fields, onPick } = props
  const baseId = useId()
  const listId = `${baseId}-list`
  const optionId = (index: number) => `${baseId}-option-${index}`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  // the highlighted row; the first one until the user moves
  const [activeIndex, setActiveIndex] = useState(0)

  const results = searchFields(fields, query)
  const active = results.length === 0 ? -1 : Math.min(activeIndex, results.length - 1)
  // the labels that two of the offered fields share: their rows also show the key
  const sharedLabels = sharedLabelIds(fields)

  function setFlyoutOpen(next: boolean) {
    // every opening starts with an empty search; a closing flyout keeps its list while it fades
    if (next) {
      setQuery('')
      setActiveIndex(0)
    }
    setOpen(next)
  }

  function moveTo(index: number) {
    setActiveIndex(index)
    revealRow(optionId(index))
  }

  function pick(field: Field) {
    setOpen(false)
    onPick(field)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        event.preventDefault()
        const next = listboxMove(event.key, active, results.length)
        if (next !== undefined) moveTo(next)
        return
      }
      case 'Enter': {
        event.preventDefault()
        const field = results[active]
        if (field) pick(field)
        return
      }
      case 'Escape':
        // the flyout's key: the editor does not see it, as in the preset picker's search field
        event.preventDefault()
        event.stopPropagation()
        setFlyoutOpen(false)
        return
    }
  }

  return (
    <Flyout
      label="Add field"
      placement="right-start"
      className="w-72"
      open={open}
      onOpenChange={setFlyoutOpen}
      trigger={
        <button
          type="button" // as high as the buttons of the edit bar under the header, at the right edge of the list
          className={twMerge(toolButtonClass(true, open), 'h-8 gap-1.5 self-end px-2.5')}
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          Add field
        </button>
      }
    >
      <div className="grid gap-2 p-2">
        <SearchField
          {...PLAIN_INPUT}
          type="search"
          role="combobox"
          spellCheck={false}
          placeholder="Search fields"
          aria-label="Search fields"
          value={query}
          aria-expanded={results.length > 0}
          aria-controls={results.length > 0 ? listId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? optionId(active) : undefined}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
        />
        {/* what a screen reader hears when the search changes; the visible note is for sighted users */}
        <p aria-live="polite" className="sr-only">
          {results.length === 0
            ? 'No field matches'
            : `${results.length} ${results.length === 1 ? 'field' : 'fields'}`}
        </p>

        {results.length === 0 ? (
          <p className={EMPTY_NOTE}>No field matches</p>
        ) : (
          <div
            id={listId}
            role="listbox"
            aria-label="Fields to add"
            // keeps the focus in the search field while a row is clicked
            onMouseDown={keepFocus}
            className="grid max-h-80 overflow-y-auto"
          >
            {results.map((field, index) => (
              <div
                key={field.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === active}
                onClick={() => pick(field)}
                className={`flex h-8 cursor-pointer items-center gap-2 px-2 ${listRow({ active: index === active })}`}
              >
                <span className="min-w-0 flex-1 truncate">{field.label}</span>
                {sharedLabels.has(field.id) ? (
                  <span className={`${HINT} max-w-[45%] shrink font-mono`}>{rowKey(field)}</span>
                ) : null}
                {field.universal ? <span className={`${HINT} shrink-0`}>general</span> : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </Flyout>
  )
}
