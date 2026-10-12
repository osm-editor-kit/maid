import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { editor, engine, useEngine } from './editor'
import { modKey } from './platform'
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
  /** Shows on the map what the command would do, or takes that away again */
  preview?: (on: boolean) => void
}

/** "Paste" at a place on the map, if something was copied */
export function usePasteCommand(at: { lon: number; lat: number } | undefined): Command[] {
  const { select } = useSelection()
  const canPaste = useEngine((e) => e.canPaste)
  if (!canPaste || !at) return []
  return [
    {
      id: 'paste',
      label: 'Paste',
      shortcut: modKey('V'),
      run: () => select(engine.paste(at.lon, at.lat)),
    },
  ]
}

/**
 * What can be done with the selection now, in the order of iD's edit menu: move and rotate,
 * copy, then the operations that apply (`edit.operation`), with delete last. Empty without a selection or when
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
      { id: 'copy', label: 'Copy', shortcut: modKey('C'), run: () => void engine.copy() },
      ...operations
        .filter((operation) => operation.applies(context))
        .map((operation) => ({
          id: operation.id,
          label: operation.label,
          // delete has a key with a modifier, which an operation's one-letter shortcut cannot say
          shortcut: operation.id === 'delete' ? modKey('⌫') : operation.shortcut?.toUpperCase(),
          reason: operation.disabled(context),
          run: () => {
            engine.previewOperation(null)
            const next = engine.runOperation(operation)
            if (next) select(next.length > 0 ? next : null)
          },
          preview: (on: boolean) => engine.previewOperation(on ? operation : null),
        })),
    ]
  })
}
