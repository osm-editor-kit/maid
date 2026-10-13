import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/react'
import type { SheetSuggestion } from './types.ts'

export type SuggestListProps = {
  /** The listbox id: the input's aria-controls. */
  id: string
  /** "Suggestions for Key": the listbox's name. */
  label: string
  /** The input the list hangs under. */
  anchor: HTMLElement
  items: readonly SheetSuggestion[]
  highlighted: number
  optionId: (index: number) => string
  onPick: (index: number) => void
}

/**
 * The one floating list of the sheet, under the cell being edited. It is mounted only while there are items,
 * so there is one `useFloating` at a time. The options keep the focus in the input (mouse down is prevented),
 * and the list stops pointer events so that the grid does not treat a click in it as a click on a cell.
 */
export function SuggestList(props: SuggestListProps) {
  const { id, label, anchor, items, highlighted, optionId, onPick } = props
  const { refs, floatingStyles } = useFloating({
    open: true,
    elements: { reference: anchor },
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
  return (
    <FloatingPortal>
      <div
        id={id}
        // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
        ref={refs.setFloating}
        role="listbox"
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        style={floatingStyles}
        className="z-50 max-h-[26rem] overflow-y-auto rounded-md border border-zinc-950/10 bg-white p-1 font-mono text-sm text-zinc-950 shadow-md dark:border-white/10 dark:bg-zinc-950 dark:text-white"
      >
        {items.map((item, index) => (
          <div
            key={`${index}:${item.value}`}
            id={optionId(index)}
            role="option"
            aria-selected={index === highlighted}
            onClick={() => onPick(index)}
            className={`flex min-h-7 cursor-pointer items-baseline gap-3 rounded px-2 py-1 ${
              index === highlighted ? 'bg-zinc-950/5 dark:bg-white/10' : ''
            }`}
          >
            <span className="min-w-0 flex-1 truncate">{item.value}</span>
            {item.hint !== undefined ? (
              <span className="max-w-[60%] min-w-0 shrink truncate font-sans text-xs text-zinc-500 dark:text-zinc-400">
                {item.hint}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </FloatingPortal>
  )
}
