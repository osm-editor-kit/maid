import { ArrowUturnLeftIcon, ArrowUturnRightIcon } from '@heroicons/react/20/solid'
import { m } from '@osm-editor-kit/maid-i18n'
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
    <ToolGroup label={m.topbar_group_history()}>
      <ToolButton
        label={
          canUndo
            ? m.topbar_undo({ change: undoLabel ?? m.topbar_last_change() })
            : m.topbar_nothing_to_undo()
        }
        shortcut={canUndo ? UNDO_KEYS : undefined}
        icon={<ArrowUturnLeftIcon className="size-5" />}
        disabled={!canUndo}
        onClick={() => engine.undo()}
      />
      <ToolButton
        label={
          canRedo
            ? m.topbar_redo({ change: redoLabel ?? m.topbar_last_change() })
            : m.topbar_nothing_to_redo()
        }
        shortcut={canRedo ? REDO_KEYS : undefined}
        icon={<ArrowUturnRightIcon className="size-5" />}
        disabled={!canRedo}
        onClick={() => engine.redo()}
      />
    </ToolGroup>
  )
}
