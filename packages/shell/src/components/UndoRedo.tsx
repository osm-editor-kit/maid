import { ArrowUturnLeftIcon, ArrowUturnRightIcon } from '@heroicons/react/20/solid'
import { ToolButton, ToolGroup } from '@osm-editor-kit/maid-ui'
import { modKey } from '../platform'
import { useEngine, useShell } from '../shell-context'

const UNDO_KEYS = modKey('Z')
const REDO_KEYS = modKey('Z', true)

/** Undo and redo buttons for the top bar */
export function UndoRedo() {
  const { engine } = useShell()
  const { canUndo, canRedo, undoLabel, redoLabel } = useEngine((e) => e.undoState())
  return (
    <ToolGroup label="History">
      <ToolButton
        label={canUndo ? `Undo: ${undoLabel ?? 'last change'}` : 'Nothing to undo'}
        shortcut={canUndo ? UNDO_KEYS : undefined}
        icon={<ArrowUturnLeftIcon className="size-5" />}
        disabled={!canUndo}
        onClick={() => engine.undo()}
      />
      <ToolButton
        label={canRedo ? `Redo: ${redoLabel ?? 'last change'}` : 'Nothing to redo'}
        shortcut={canRedo ? REDO_KEYS : undefined}
        icon={<ArrowUturnRightIcon className="size-5" />}
        disabled={!canRedo}
        onClick={() => engine.redo()}
      />
    </ToolGroup>
  )
}
