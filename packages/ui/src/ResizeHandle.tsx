import { twJoin } from 'tailwind-merge'
import type { ResizeHandleEvents } from './useResizable.ts'

/** Two-column grip for a vertical handle. Heroicons has no grip. */
function VerticalGripIcon() {
  return (
    <svg viewBox="0 0 10 16" className="h-2.5 w-1.5" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="2" r="1.15" />
      <circle cx="7.5" cy="2" r="1.15" />
      <circle cx="2.5" cy="8" r="1.15" />
      <circle cx="7.5" cy="8" r="1.15" />
      <circle cx="2.5" cy="14" r="1.15" />
      <circle cx="7.5" cy="14" r="1.15" />
    </svg>
  )
}

/** Two-row grip for a horizontal handle. */
function HorizontalGripIcon() {
  return (
    <svg viewBox="0 0 16 10" className="h-1.5 w-2.5" fill="currentColor" aria-hidden>
      <circle cx="2.5" cy="3" r="1.15" />
      <circle cx="8" cy="3" r="1.15" />
      <circle cx="13.5" cy="3" r="1.15" />
      <circle cx="2.5" cy="7" r="1.15" />
      <circle cx="8" cy="7" r="1.15" />
      <circle cx="13.5" cy="7" r="1.15" />
    </svg>
  )
}

/**
 * Strip on one edge of a panel that resizes it. It sits on the edge line; a grip pill shows at
 * the middle on hover, and while the panel is being dragged. `right` is for a sidebar on the
 * left of the map, `top` is for a dock under the map. The parent must be `relative`.
 */
export function ResizeHandle(
  props: {
    label: string
    edge: 'right' | 'top'
    dragging?: boolean
  } & ResizeHandleEvents,
) {
  const { label, edge, dragging = false, onPointerDown, onDoubleClick } = props
  const vertical = edge === 'right'
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
      className={twJoin(
        'group absolute z-30 touch-none select-none',
        vertical
          ? 'inset-y-0 left-full w-2 cursor-col-resize'
          : 'inset-x-0 bottom-full h-2 cursor-row-resize',
      )}
    >
      <span
        aria-hidden
        className={twJoin(
          'pointer-events-none absolute rounded-full bg-zinc-950/80 transition-opacity dark:bg-white/80',
          vertical
            ? 'inset-y-2 left-0 w-1.5 -translate-x-1/2'
            : 'inset-x-2 bottom-0 h-1.5 translate-y-1/2',
          dragging ? 'opacity-100' : 'opacity-0 group-active:opacity-100',
        )}
      />
      <span
        className={twJoin(
          'pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity',
          dragging
            ? 'opacity-100'
            : 'opacity-0 group-active:opacity-100 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100',
        )}
      >
        <span
          className={twJoin(
            'inline-flex items-center justify-center rounded-full bg-zinc-300 text-zinc-600 dark:bg-zinc-600 dark:text-zinc-300',
            vertical ? 'h-5 w-2.5' : 'h-2.5 w-5',
            dragging && 'bg-zinc-950/80 text-white dark:bg-white/80 dark:text-zinc-950',
            'group-active:bg-zinc-950/80 group-active:text-white dark:group-active:bg-white/80 dark:group-active:text-zinc-950',
          )}
        >
          {vertical ? <VerticalGripIcon /> : <HorizontalGripIcon />}
        </span>
      </span>
    </div>
  )
}
