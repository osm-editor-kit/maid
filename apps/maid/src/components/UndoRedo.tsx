import { engine, useEngine } from '../editor'
import { useUndoShortcuts } from './useUndoShortcuts'

const BUTTON =
  'grid size-9 place-items-center bg-white text-neutral-800 enabled:hover:bg-neutral-100 disabled:text-neutral-300 dark:bg-neutral-800 dark:text-white dark:enabled:hover:bg-neutral-700 dark:disabled:text-neutral-600'

function isMacPlatform(): boolean {
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = agent.userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad/i.test(platform)
}

const MAC = isMacPlatform()
const UNDO_KEYS = MAC ? '⌘Z' : 'Ctrl+Z'
const REDO_KEYS = MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z'

function UndoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
    </svg>
  )
}

function RedoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h3" />
    </svg>
  )
}

/** Undo and redo buttons at the top centre of the map. Also owns the keyboard shortcuts. */
export function UndoRedo() {
  useUndoShortcuts()
  const { canUndo, canRedo, undoLabel, redoLabel } = useEngine((e) => e.undoState())
  const undoTitle = canUndo
    ? `Undo: ${undoLabel ?? 'last change'} (${UNDO_KEYS})`
    : 'Nothing to undo'
  const redoTitle = canRedo
    ? `Redo: ${redoLabel ?? 'last change'} (${REDO_KEYS})`
    : 'Nothing to redo'
  return (
    <div className="absolute top-2 left-1/2 flex -translate-x-1/2 divide-x divide-neutral-300 overflow-hidden rounded-md shadow dark:divide-neutral-600">
      <button
        type="button"
        aria-label={undoTitle}
        title={undoTitle}
        disabled={!canUndo}
        className={BUTTON}
        onClick={() => engine.undo()}
      >
        <UndoIcon />
      </button>
      <button
        type="button"
        aria-label={redoTitle}
        title={redoTitle}
        disabled={!canRedo}
        className={BUTTON}
        onClick={() => engine.redo()}
      >
        <RedoIcon />
      </button>
    </div>
  )
}
