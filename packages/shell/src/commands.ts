import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import type { ReactNode } from 'react'
import { commandIcon } from './command-icons'
import { editor, engine, useEngine } from './editor'
import { modKey } from './platform'
import { useSelection } from './selection'

/** One entry of the edit menu: in the sidebar, on a right click, and behind its key */
export type Command = {
  id: string
  label: string
  /** iD's icon for it, the same in the sidebar and in the menu */
  icon: ReactNode
  /** The key as it is shown, e.g. "M" or "⌘C" */
  shortcut?: string
  /** Why it cannot run now; then it is shown greyed out */
  reason?: string
  run: () => void
  /** Shows on the map what the command would do, or takes that away again */
  preview?: (on: boolean) => void
}

/** Why the commands of a feature that a filter protects cannot run */
export const PROTECTED_REASON = 'A filter protects this feature'

/**
 * True if a filter protects the entity: it may be looked at, not changed. The builder records
 * that when it builds the feature, but a selection is built after the menu has been drawn and
 * nothing draws the menu again, so the filters are asked from the tags. Which geometry a way has
 * is not asked: the filter that protects its tags protects it as an area or as a line. A vertex
 * follows its ways.
 */
function protectedBy(id: string) {
  if (engine.isReadOnly(id)) return true
  const { filters } = engine
  const readOnly = (
    tags: Record<string, string>,
    geometries: Parameters<typeof filters.stateOf>[1][],
  ) => geometries.some((geometry) => filters.stateOf(tags, geometry) === 'readonly')
  if (id.startsWith('w')) {
    const tags = engine.data.way(id)?.tags
    return tags !== undefined && readOnly(tags, ['area', 'line'])
  }
  if (id.startsWith('n')) {
    const ways = engine.data.nodeWays.get(id) ?? []
    if (ways.length > 0) return ways.some(protectedBy)
    const tags = engine.data.node(id)?.tags
    return tags !== undefined && readOnly(tags, ['point'])
  }
  return false
}

/** "Paste" at a place on the map, if something was copied */
export function usePasteCommand(at: { lon: number; lat: number } | undefined) {
  const { select } = useSelection()
  const canPaste = useEngine((e) => e.canPaste)
  if (!canPaste || !at) return []
  return [
    {
      id: 'paste',
      label: 'Paste',
      icon: commandIcon('paste'),
      shortcut: modKey('V'),
      run: () => select(engine.paste(at.lon, at.lat)),
    },
  ]
}

/**
 * What can be done with the selection now, in the order of iD's edit menu: move and rotate,
 * copy, then the operations that apply (`edit.operation`), with delete last. Empty without a
 * selection. A feature that a filter protects keeps its commands, greyed out with the reason.
 */
export function useEditCommands() {
  const operations = useExtensionPoint(editor, 'edit.operation')
  const { ids, select } = useSelection()
  // the version makes this read again after every edit: what applies depends on the data
  return useEngine((e) => {
    if (ids.length === 0) return []
    const protectedIds = ids.some(protectedBy)
    const context = e.operationContext()
    return [
      {
        id: 'move',
        label: 'Move',
        icon: commandIcon('move'),
        shortcut: 'M',
        reason: protectedIds ? PROTECTED_REASON : undefined,
        run: () => void engine.setMode('move'),
      },
      {
        id: 'rotate',
        label: 'Rotate',
        icon: commandIcon('rotate'),
        shortcut: 'R',
        reason: protectedIds ? PROTECTED_REASON : undefined,
        run: () => void engine.setMode('rotate'),
      },
      {
        id: 'copy',
        label: 'Copy',
        icon: commandIcon('copy'),
        shortcut: modKey('C'),
        reason: protectedIds ? PROTECTED_REASON : undefined,
        run: () => void engine.copy(),
      },
      ...operations
        .filter((operation) => operation.applies(context))
        .map((operation) => ({
          id: operation.id,
          label: operation.label,
          icon: commandIcon(operation.id),
          // delete has a key with a modifier, which an operation's one-letter shortcut cannot say
          shortcut: operation.id === 'delete' ? modKey('⌫') : operation.shortcut?.toUpperCase(),
          reason: protectedIds ? PROTECTED_REASON : operation.disabled(context),
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
