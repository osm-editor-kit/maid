import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { m } from '@osm-editor-kit/maid-i18n'
import { visibleOperations } from '@osm-editor-kit/maid-operations'
import type { Operation } from '@osm-editor-kit/maid-operations'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import type { ReactNode } from 'react'
import { pasteAt } from './clipboard'
import { commandIcon } from './command-icons'
import { modKey } from './platform'
import { useSelection } from './selection'
import { useEngine, useShell } from './shell-context'

/** One entry of the edit menu: in the sidebar, on a right click, and behind its key */
export type Command = {
  id: string
  label: string
  /** iD's icon for it, the same in the sidebar and in the menu */
  icon: ReactNode
  /** The key as it is shown, e.g. "M" or "⌘C" */
  shortcut?: string
  /** What it does, when that is not its label: shown in its tooltip (not when `reason` is set) */
  description?: string
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
function protectedBy(engine: MaidEngine, id: string): boolean {
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
    if (ways.length > 0) return ways.some((way) => protectedBy(engine, way))
    const tags = engine.data.node(id)?.tags
    return tags !== undefined && readOnly(tags, ['point'])
  }
  return false
}

/** "Paste" at a place on the map, if something was copied */
export function usePasteCommand(at: { lon: number; lat: number } | undefined) {
  const { engine } = useShell()
  const { select } = useSelection()
  const canPaste = useEngine((e) => e.canPaste)
  if (!canPaste || !at) return []
  return [
    {
      id: 'paste',
      label: 'Paste',
      icon: commandIcon('paste'),
      shortcut: modKey('V'),
      run: () => select(pasteAt(engine, at.lon, at.lat)),
    },
  ]
}

/** Operations the edit menu lists before Move when they apply: iD's Continue, the default action at the end of a line */
const LEADING_OPERATIONS = ['continue']

/**
 * The items of the edit menu at a place, in order. On open ground (`ground`) only Paste: the selection is not what the
 * menu is about there. On a feature there is no Paste: pasting another geometry through a feature's menu makes no sense
 * (Cmd+V still pastes where the pointer is). Otherwise: the features at the place, then the commands of the selection.
 */
export function editMenuItems<Here, Selected, Pasted>(
  place: { ground?: boolean },
  parts: {
    here: readonly Here[]
    selection: readonly Selected[]
    paste: readonly Pasted[]
  },
): (Here | Selected | Pasted)[] {
  return place.ground ? [...parts.paste] : [...parts.here, ...parts.selection]
}

/**
 * What can be done with the selection now, in the order of iD's edit menu: the operations that
 * lead (Continue, when it applies), move and rotate, copy, then the other operations that apply
 * (`edit.operation`), with delete last. Empty without a selection. A feature that a filter
 * protects keeps its commands, greyed out with the reason.
 */
export function useEditCommands() {
  const { editor, engine } = useShell()
  const operations = useExtensionPoint(editor, 'edit.operation')
  const { ids, select } = useSelection()
  // the version makes this read again after every edit: what applies depends on the data
  return useEngine((e): Command[] => {
    if (ids.length === 0) return []
    const protectedIds = ids.some((id) => protectedBy(engine, id))
    const context = e.operationContext()
    // one point with a direction: R turns that direction, as iD's tooltip says
    const turnsDirection = e.transform.directionOf(ids) !== undefined
    // what applies, less the operations a superseding one replaces here (the core Merge under the areas union)
    const applicable = visibleOperations(operations, context)
    const commandOf = (operation: Operation): Command => ({
      id: operation.id,
      label: operation.label,
      icon: commandIcon(operation.id, operation.icon),
      // delete has a key with a modifier, which an operation's one-letter shortcut cannot say
      shortcut: operation.id === 'delete' ? modKey('⌫') : operation.shortcut?.toUpperCase(),
      reason: protectedIds ? PROTECTED_REASON : operation.disabled(context),
      run: () => {
        engine.previewOperation(null)
        const next = engine.runOperation(operation)
        if (next) select(next.length > 0 ? next : null)
      },
      preview: (on: boolean) => engine.previewOperation(on ? operation : null),
    })
    return [
      ...applicable.filter((operation) => LEADING_OPERATIONS.includes(operation.id)).map(commandOf),
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
        description: turnsDirection ? m.rotate_point_description() : undefined,
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
      ...applicable
        .filter((operation) => !LEADING_OPERATIONS.includes(operation.id))
        .map(commandOf),
    ]
  })
}
