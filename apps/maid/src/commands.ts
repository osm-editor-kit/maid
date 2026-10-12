import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { editor, engine, useEngine } from './editor'
import { useSelection } from './selection'

/** One entry of the edit menu: in the sidebar, on a right click, and behind its key */
export type Command = {
  id: string
  label: string
  /** The key as it is shown, e.g. "M" or "⌘C" */
  shortcut?: string
  /** Why it cannot run now; then it is shown greyed out */
  reason?: string
  run: () => void
}

const MAC = /mac|iphone|ipad/i.test(navigator.platform)
const MOD = MAC ? '⌘' : 'Ctrl+'

/**
 * What can be done with the selection now, in the order of iD's edit menu: move and rotate,
 * the operations that apply (`edit.operation`), copy, delete. Empty without a selection or when
 * a filter makes it read-only.
 */
export function useEditCommands(): Command[] {
  const operations = useExtensionPoint(editor, 'edit.operation')
  const { ids, select } = useSelection()
  // the version makes this read again after every edit: what applies depends on the data
  return useEngine((e) => {
    if (ids.length === 0 || ids.some((id) => e.isReadOnly(id))) return []
    const context = e.operationContext()
    return [
      { id: 'move', label: 'Move', shortcut: 'M', run: () => void engine.setMode('move') },
      { id: 'rotate', label: 'Rotate', shortcut: 'R', run: () => void engine.setMode('rotate') },
      ...operations
        .filter((operation) => operation.applies(context))
        .map((operation) => ({
          id: operation.id,
          label: operation.label,
          shortcut: operation.shortcut?.toUpperCase(),
          reason: operation.disabled(context),
          run: () => {
            const next = engine.runOperation(operation)
            if (next) select(next)
          },
        })),
      { id: 'copy', label: 'Copy', shortcut: `${MOD}C`, run: () => void engine.copy() },
      {
        id: 'delete',
        label: 'Delete',
        shortcut: `${MOD}⌫`,
        run: () => {
          // several features go one by one, each its own undo step for now
          for (const id of ids) engine.deleteEntity(id)
          select(null)
        },
      },
    ]
  })
}
