import { ArrowUturnLeftIcon, ArrowUturnRightIcon } from '@heroicons/react/20/solid'
import { ToolButton, ToolGroup } from '@osm-editor-kit/maid-ui'
import { engine, useEngine } from '../editor'
import { useUndoShortcuts } from './useUndoShortcuts'

function isMacPlatform(): boolean {
  const agent = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = agent.userAgentData?.platform ?? navigator.platform
  return /mac|iphone|ipad/i.test(platform)
}

const MAC = isMacPlatform()
const UNDO_KEYS = MAC ? '⌘Z' : 'Ctrl+Z'
const REDO_KEYS = MAC ? '⇧⌘Z' : 'Ctrl+Shift+Z'

/** Undo and redo buttons for the top bar. Also owns the keyboard shortcuts. */
export function UndoRedo() {
  useUndoShortcuts()
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
